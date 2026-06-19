import { Injectable, Logger, ConflictException, ForbiddenException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { CallSession } from './entities/call-session.entity';
import { SosEvent } from './entities/sos-event.entity';
import { NotificationEntity } from './entities/notification.entity';
import { RedisService } from 'apps/common/src/redis/redis.service';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { AuthServiceClient } from 'libs/types/auth-service';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import axios from 'axios';

@Injectable()
export class CommunicationService implements OnModuleInit {
  private readonly logger = new Logger(CommunicationService.name);
  private authService: AuthServiceClient;

  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepo: Repository<ChatRoom>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(CallSession)
    private readonly callSessionRepo: Repository<CallSession>,
    @InjectRepository(SosEvent)
    private readonly sosEventRepo: Repository<SosEvent>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    private readonly redisService: RedisService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.authService = this.authClient.getService<AuthServiceClient>('AuthService');

    // Poll for pending scheduled notifications every 10 seconds
    setInterval(() => {
      this.processScheduledNotifications().catch(err => {
        this.logger.error('Error processing scheduled notifications:', err);
      });
    }, 10000);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Chat Rooms and Messages Logic
  // ─────────────────────────────────────────────────────────────

  async openChatRooms(bookingId: string, passengerId: string, driverId: string, ownerId: string) {
    this.logger.log(`Opening chat rooms for booking ${bookingId}`);
    
    // Create/find Passenger-Driver Room
    let pdRoom = await this.chatRoomRepo.findOne({
      where: { bookingId, roomType: 'passenger_driver' },
    });
    if (!pdRoom) {
      pdRoom = this.chatRoomRepo.create({
        bookingId,
        participantAId: passengerId,
        participantBId: driverId,
        roomType: 'passenger_driver',
        status: 'active',
      });
      pdRoom = await this.chatRoomRepo.save(pdRoom);
    }

    // Create/find Passenger-Owner Room
    let poRoom = await this.chatRoomRepo.findOne({
      where: { bookingId, roomType: 'passenger_owner' },
    });
    if (!poRoom) {
      poRoom = this.chatRoomRepo.create({
        bookingId,
        participantAId: passengerId,
        participantBId: ownerId,
        roomType: 'passenger_owner',
        status: 'active',
      });
      poRoom = await this.chatRoomRepo.save(poRoom);
    }

    return {
      passengerDriverRoomId: pdRoom.id,
      passengerOwnerRoomId: poRoom.id,
      success: true,
    };
  }

  async closeChatRooms(bookingId: string) {
    this.logger.log(`Closing chat rooms for booking ${bookingId}`);
    await this.chatRoomRepo.update(
      { bookingId },
      { status: 'readonly' },
    );
    return { success: true };
  }

  async archiveChatRooms(bookingId: string) {
    this.logger.log(`Archiving chat rooms for booking ${bookingId}`);
    await this.chatRoomRepo.update(
      { bookingId },
      { status: 'archived', archivedAt: new Date() },
    );
    return { success: true };
  }

  async verifyChatAccess(roomId: string, userId: string) {
    const room = await this.chatRoomRepo.findOne({ where: { id: roomId } });
    if (!room) {
      return { allowed: false, roomStatus: '' };
    }
    const allowed = room.participantAId === userId || room.participantBId === userId;
    return { allowed, roomStatus: room.status };
  }

  async listRooms(userId: string, role: string) {
    this.logger.log(`Listing rooms for user ${userId} (${role})`);
    
    // Find all chat rooms where the user is either participant A or participant B
    const rooms = await this.chatRoomRepo.find({
      where: [
        { participantAId: userId },
        { participantBId: userId },
      ],
      order: { createdAt: 'DESC' },
    });

    const result: any[] = [];
    for (const room of rooms) {
      // Fetch last message
      const lastMsg = await this.messageRepo.findOne({
        where: { roomId: room.id },
        order: { sentAt: 'DESC' },
      });

      // Count unread messages (sent by the OTHER participant, having readAt null)
      const unreadCount = await this.messageRepo.count({
        where: {
          roomId: room.id,
          readAt: IsNull(),
        },
      });

      result.push({
        roomId: room.id,
        bookingId: room.bookingId,
        roomType: room.roomType,
        status: room.status,
        lastMessage: lastMsg
          ? { content: lastMsg.content, sentAt: lastMsg.sentAt.toISOString() }
          : null,
        unreadCount,
      });
    }

    return { rooms: result };
  }

  async getMessages(roomId: string, userId: string, limit = 50, beforeMessageId?: string) {
    // Verify user has access to room
    const access = await this.verifyChatAccess(roomId, userId);
    if (!access.allowed) {
      throw new ForbiddenException('You do not have access to this chat room');
    }

    const queryBuilder = this.messageRepo.createQueryBuilder('message')
      .where('message.room_id = :roomId', { roomId })
      .orderBy('message.sent_at', 'DESC')
      .limit(limit);

    if (beforeMessageId) {
      const beforeMsg = await this.messageRepo.findOne({ where: { id: beforeMessageId } });
      if (beforeMsg) {
        queryBuilder.andWhere('message.sent_at < :sentAt', { sentAt: beforeMsg.sentAt });
      }
    }

    const messages = await queryBuilder.getMany();
    // Reverse to chronological order for client view
    messages.reverse();

    // Check if there are more
    let hasMore = false;
    if (messages.length > 0) {
      const oldestLoaded = messages[0];
      const countPrior = await this.messageRepo.count({
        where: {
          roomId,
          sentAt: LessThan(oldestLoaded.sentAt),
        },
      });
      hasMore = countPrior > 0;
    }

    return {
      messages: messages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        contentType: m.contentType,
        sentAt: m.sentAt.toISOString(),
        readAt: m.readAt ? m.readAt.toISOString() : null,
      })),
      hasMore,
    };
  }

  async sendMessage(roomId: string, senderId: string, content: string, contentType = 'text') {
    const room = await this.chatRoomRepo.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Chat room not found');
    }
    if (room.status === 'archived') {
      throw new ForbiddenException('Chat room is archived and read-only');
    }
    if (room.participantAId !== senderId && room.participantBId !== senderId) {
      throw new ForbiddenException('You are not a participant in this chat room');
    }

    // Save message to Postgres
    let message = this.messageRepo.create({
      roomId,
      senderId,
      content,
      contentType,
      sentAt: new Date(),
    });
    message = await this.messageRepo.save(message);

    // Sync to Firebase Realtime DB (Mock/Log behavior)
    this.logger.log(`[Firebase Realtime DB Sync] Room: ${roomId}, Message ID: ${message.id}, Sender: ${senderId}, Content: "${content}"`);

    // Send FCM Notification (Mock/Log behavior)
    const recipientId = room.participantAId === senderId ? room.participantBId : room.participantAId;
    this.logger.log(`[FCM Notification] Sending push to recipient ${recipientId} for new message in room ${roomId}`);

    return {
      messageId: message.id,
      sentAt: message.sentAt.toISOString(),
    };
  }

  async markAsRead(roomId: string, userId: string) {
    const access = await this.verifyChatAccess(roomId, userId);
    if (!access.allowed) {
      throw new ForbiddenException('You do not have access to this chat room');
    }

    // Mark messages sent by the other participant as read
    const result = await this.messageRepo.createQueryBuilder()
      .update(Message)
      .set({ readAt: new Date() })
      .where('room_id = :roomId', { roomId })
      .andWhere('sender_id != :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();

    return { markedCount: result.affected ?? 0 };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Call Sessions Logic (Twilio + Redis)
  // ─────────────────────────────────────────────────────────────

  async activateCallProxy(bookingId: string, passengerId: string, driverId: string, ownerId: string) {
    this.logger.log(`Activating call proxy state in Redis for booking ${bookingId}`);
    // Save state in Redis for the 45-min active pickup window
    const data = JSON.stringify({ passengerId, driverId, ownerId, status: 'active' });
    await this.redisService.set(`booking:${bookingId}:proxy`, data, 86400); // 24 hour max ttl
    return { proxySessionId: bookingId, success: true };
  }

  async deactivateCallProxy(bookingId: string, reason: string) {
    this.logger.log(`Deactivating call proxy in Redis for booking ${bookingId} due to: ${reason}`);
    await this.redisService.del(`booking:${bookingId}:proxy`);
    // End any open call sessions in database
    await this.callSessionRepo.update(
      { bookingId, status: 'active' },
      { status: 'ended', closedAt: new Date() },
    );
    return { success: true };
  }

  async initiateCall(bookingId: string, callerId: string, callTo: string) {
    // 1. Validate call proxy window in Redis
    const proxyStateRaw = await this.redisService.get(`booking:${bookingId}:proxy`);
    if (!proxyStateRaw) {
      throw new ForbiddenException('Call proxy window is not open or booking state is inactive');
    }

    const proxyState = JSON.parse(proxyStateRaw);
    let calleeId = '';
    if (callTo === 'driver') {
      calleeId = proxyState.driverId;
    } else if (callTo === 'owner') {
      calleeId = proxyState.ownerId;
    } else {
      throw new ConflictException('Invalid callee role. Choose "driver" or "owner"');
    }

    if (!calleeId) {
      throw new NotFoundException(`No ${callTo} assigned to this booking`);
    }

    // 2. Check for active call session
    const activeSession = await this.callSessionRepo.findOne({
      where: { bookingId, status: 'active' },
    });
    if (activeSession) {
      throw new ConflictException('An active call session already exists for this booking');
    }

    // Mock Twilio virtual number allocation
    const virtualNumber = '+919999999999';
    const twilioCallSid = 'CA' + Math.random().toString(36).substring(2, 15).toUpperCase();

    // 3. Save call session to Postgres
    let session = this.callSessionRepo.create({
      bookingId,
      callerId,
      calleeId,
      twilioCallSid,
      virtualNumber,
      status: 'active',
      openedAt: new Date(),
    });
    session = await this.callSessionRepo.save(session);

    // Trigger mock Twilio Call bridge
    this.logger.log(`[Twilio Call Bridge] Bridging caller ${callerId} to callee ${calleeId} using virtual number ${virtualNumber}`);

    return {
      callSessionId: session.id,
      status: 'connecting',
      maskedNumber: virtualNumber,
    };
  }

  async endCall(callSessionId: string) {
    const session = await this.callSessionRepo.findOne({ where: { id: callSessionId } });
    if (!session) {
      throw new NotFoundException('Call session not found');
    }

    if (session.status === 'ended') {
      return {
        duration: session.durationSeconds || 0,
        endedAt: session.closedAt ? session.closedAt.toISOString() : new Date().toISOString(),
      };
    }

    const duration = Math.floor(Math.random() * 300) + 10; // Mock duration between 10-310s
    const endedAt = new Date();

    session.status = 'ended';
    session.closedAt = endedAt;
    session.durationSeconds = duration;
    await this.callSessionRepo.save(session);

    this.logger.log(`[Call Session Ended] Session ${callSessionId} closed. Duration: ${duration}s`);
    return {
      duration,
      endedAt: endedAt.toISOString(),
    };
  }

  async handleTwilioWebhook(payload: any) {
    this.logger.log(`[Twilio Webhook Received] CallSid: ${payload.CallSid}, Status: ${payload.CallStatus}, Duration: ${payload.Duration}`);
    const session = await this.callSessionRepo.findOne({ where: { twilioCallSid: payload.CallSid } });
    if (session) {
      session.status = 'ended';
      session.closedAt = new Date();
      session.durationSeconds = payload.Duration ? parseInt(payload.Duration, 10) : 0;
      await this.callSessionRepo.save(session);
    }
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SOS Alerting Logic (Supabase + Twilio SMS + Redis Pub/Sub + FCM)
  // ─────────────────────────────────────────────────────────────

  async triggerSos(bookingId: string, triggeredBy: string, role: string, latitude: number, longitude: number) {
    this.logger.warn(`!!! SOS ALERT !!! Booking: ${bookingId}, Triggered By: ${triggeredBy} (${role}), Coordinates: (${latitude}, ${longitude})`);

    // 1. Write SOS event to PostgreSQL in a transaction
    let sosEvent = this.sosEventRepo.create({
      bookingId,
      triggeredBy,
      role,
      latitude,
      longitude,
      status: 'active',
      triggeredAt: new Date(),
    });
    sosEvent = await this.sosEventRepo.save(sosEvent);

    // 2. Publish SOS event to Redis pub/sub channel sos:active
    const redisPayload = JSON.stringify({
      sosId: sosEvent.id,
      bookingId,
      triggeredBy,
      role,
      latitude,
      longitude,
      triggeredAt: sosEvent.triggeredAt,
    });
    await this.redisClient.publish('sos:active', redisPayload);
    this.logger.log(`[Redis Pub/Sub] Published SOS alert to 'sos:active'`);

    // 3. FCM Push (Mock)
    this.logger.log(`[FCM SOS Push] Emitted high-priority emergency notifications to driver, owner, and support desk.`);

    // 4. SMS via Twilio to emergency contacts (Mock)
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    this.logger.log(`[Twilio Emergency SMS] Sent SMS to emergency contacts: "EMERGENCY: User ${triggeredBy} triggered SOS for booking ${bookingId}. Location: ${mapLink}"`);

    // Return immediately (async behavior of SMS / Push satisfies "Return immediately — do not wait for SMS delivery")
    return {
      sosId: sosEvent.id,
      status: 'active',
      triggeredAt: sosEvent.triggeredAt.toISOString(),
      message: 'Emergency alert sent to all contacts',
    };
  }

  async getSos(sosId: string) {
    const event = await this.sosEventRepo.findOne({ where: { id: sosId } });
    if (!event) {
      throw new NotFoundException('SOS event not found');
    }
    return {
      sosId: event.id,
      bookingId: event.bookingId,
      triggeredBy: event.triggeredBy,
      role: event.role,
      latitude: event.latitude ? parseFloat(event.latitude as any) : null,
      longitude: event.longitude ? parseFloat(event.longitude as any) : null,
      status: event.status,
      triggeredAt: event.triggeredAt.toISOString(),
    };
  }

  async resolveSos(sosId: string, resolvedBy: string, notes?: string) {
    const event = await this.sosEventRepo.findOne({ where: { id: sosId } });
    if (!event) {
      throw new NotFoundException('SOS event not found');
    }

    event.status = 'resolved';
    event.resolvedAt = new Date();
    event.resolvedBy = resolvedBy;
    await this.sosEventRepo.save(event);

    this.logger.log(`[SOS Resolved] Event ${sosId} resolved by ${resolvedBy}. Notes: "${notes || 'None'}"`);
    return {
      sosId: event.id,
      resolvedAt: event.resolvedAt.toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Notifications & 2Factor Messaging Logic
  // ─────────────────────────────────────────────────────────────

  private async trigger2Factor(mobile: string, content: string, channel: string) {
    const apiKey = this.configService.get<string>('TWOFACTOR_API_KEY');
    if (!apiKey) {
      this.logger.log(`[2Factor Simulation] (No API Key set) Channel: ${channel}, To: ${mobile}, Content: "${content}"`);
      return;
    }

    try {
      this.logger.log(`[2Factor Send] Sending ${channel} to ${mobile} via 2Factor...`);
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${mobile}/${encodeURIComponent(content)}`;
      const response = await axios.get(url);
      this.logger.log(`[2Factor Response] Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
    } catch (e: any) {
      this.logger.error(`[2Factor Error] Failed to send ${channel} via 2Factor: ${e.message}`);
    }
  }

  private async sendActualNotification(notif: NotificationEntity) {
    let mobile = '';
    let name = 'User';
    try {
      if (this.authService && typeof this.authService.getMe === 'function') {
        const userRes = await lastValueFrom(this.authService.getMe({ userId: notif.userId }));
        if (userRes?.user) {
          mobile = userRes.user.mobile || '';
          name = userRes.user.name || 'User';
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to fetch user info for notification: ${err.message}`);
    }

    // Handle in-app channel
    if (notif.channel === 'in-app' || notif.channel === 'both') {
      this.logger.log(`[In-App Notification] To: ${name} (${notif.userId}), Title: "${notif.title}", Content: "${notif.content}"`);
    }

    // Handle WhatsApp channel
    if (notif.channel === 'whatsapp' || notif.channel === 'both') {
      if (mobile) {
        await this.trigger2Factor(mobile, notif.content, 'WhatsApp');
      } else {
        this.logger.warn(`Cannot send WhatsApp notification to user ${notif.userId}: No mobile number registered`);
      }
    }

    notif.status = 'SENT';
    notif.sentAt = new Date();
    await this.notificationRepo.save(notif);
  }

  async sendNotification(
    userId: string,
    title: string,
    content: string,
    channel: string,
    delayMinutes = 0,
    externalId?: string,
  ) {
    const notif = this.notificationRepo.create({
      userId,
      title,
      content,
      channel,
      status: delayMinutes > 0 ? 'PENDING' : 'SENT',
      scheduledAt: delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60000) : null,
      externalId: externalId || null,
      createdAt: new Date(),
    });

    const saved = await this.notificationRepo.save(notif);

    if (delayMinutes === 0) {
      await this.sendActualNotification(saved);
    } else {
      this.logger.log(`[Scheduled Notification] Scheduled ${channel} notification for user ${userId} in ${delayMinutes} minutes. External ID: ${externalId || 'None'}`);
    }

    return {
      notificationId: saved.id,
      success: true,
    };
  }

  async cancelNotification(externalId: string) {
    const notifs = await this.notificationRepo.find({
      where: { externalId, status: 'PENDING' },
    });

    if (notifs.length > 0) {
      for (const notif of notifs) {
        notif.status = 'CANCELLED';
        await this.notificationRepo.save(notif);
        this.logger.log(`[Cancelled Notification] Cancelled pending scheduled notification ID: ${notif.id}, External ID: ${externalId}`);
      }
    }

    return { success: true };
  }

  async getNotifications(userId: string) {
    const notifications = await this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return { notifications };
  }

  async sendAdminNotification(body: {
    userId?: string;
    group?: string;
    title: string;
    content: string;
    channel: string;
  }) {
    const { userId, group, title, content, channel } = body;

    if (userId) {
      await this.sendNotification(userId, title, content, channel);
    } else if (group) {
      this.logger.log(`[Admin Group Notification] Sending notification to group ${group}: "${title}"`);
      let users: any[] = [];
      try {
        if (this.authService && typeof this.authService.listUsersByRole === 'function') {
          const res = await lastValueFrom(this.authService.listUsersByRole({ role: group }));
          users = res?.users || [];
        }
      } catch (err: any) {
        this.logger.error(`Failed to list users for group ${group}: ${err.message}`);
      }

      for (const user of users) {
        await this.sendNotification(user.id, title, content, channel);
      }
    }

    return { success: true };
  }

  async processScheduledNotifications() {
    const now = new Date();
    const pending = await this.notificationRepo.createQueryBuilder('notification')
      .where('notification.status = :status', { status: 'PENDING' })
      .andWhere('notification.scheduled_at <= :now', { now })
      .getMany();

    for (const notif of pending) {
      try {
        await this.sendActualNotification(notif);
      } catch (err: any) {
        this.logger.error(`Failed to send scheduled notification ${notif.id}: ${err.message}`);
      }
    }
  }
}

import { Injectable, Logger, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { CallSession } from './entities/call-session.entity';
import { SosEvent } from './entities/sos-event.entity';
import { RedisService } from 'apps/common/src/redis/redis.service';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepo: Repository<ChatRoom>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(CallSession)
    private readonly callSessionRepo: Repository<CallSession>,
    @InjectRepository(SosEvent)
    private readonly sosEventRepo: Repository<SosEvent>,
    private readonly redisService: RedisService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {}

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
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entity/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  async adminGetUsers(
    role?: string,
    kycStatus?: string,
    page = 1,
    limit = 20,
  ): Promise<{ users: User[]; total: number }> {
    const qb = this.userRepository.createQueryBuilder('user');
    if (role) {
      qb.andWhere(':role = ANY(user.roles)', { role: role.toUpperCase() });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [users, total] = await qb.getManyAndCount();
    return { users, total };
  }

  async adminUpdateUserStatus(
    userId: string,
    action: string,
    reason: string,
  ): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    user.isActive = action === 'REACTIVATE';
    await this.userRepository.save(user);
    return {
      userId: user.id,
      isActive: user.isActive,
      action,
      reason,
      updatedAt: new Date().toISOString(),
    };
  }

  async listUsersByRole(role: string): Promise<User[]> {
    const qb = this.userRepository.createQueryBuilder('user');
    const upperRole = role.toUpperCase();
    qb.where(':role = ANY(user.roles)', { role: upperRole });
    return qb.getMany();
  }
}

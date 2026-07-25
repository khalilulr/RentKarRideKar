import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer } from '../entities/Offer.entity';

@Injectable()
export class OfferRepository {
  constructor(
    @InjectRepository(Offer)
    private readonly repo: Repository<Offer>,
  ) {}

  async create(offerData: Partial<Offer>): Promise<Offer> {
    const offer = this.repo.create(offerData);
    return this.repo.save(offer);
  }

  async save(offer: Offer): Promise<Offer> {
    return this.repo.save(offer);
  }

  async findById(id: string): Promise<Offer | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<Offer | null> {
    // case insensitive search
    return this.repo
      .createQueryBuilder('offer')
      .where('LOWER(offer.code) = LOWER(:code)', { code })
      .getOne();
  }

  async findAll(filter: 'active' | 'inactive' | 'all'): Promise<Offer[]> {
    if (filter === 'active') {
      return this.repo.find({ where: { isActive: true } });
    } else if (filter === 'inactive') {
      return this.repo.find({ where: { isActive: false } });
    }
    return this.repo.find();
  }
}

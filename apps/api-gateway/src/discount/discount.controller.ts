import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Inject,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  DiscountServiceClient,
  DISCOUNT_SERVICE_NAME,
} from '../../../../libs/types/discount';

@Controller()
export class DiscountController implements OnModuleInit {
  private discountService: DiscountServiceClient;

  constructor(
    @Inject('DISCOUNT_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.discountService = this.client.getService<DiscountServiceClient>(
      DISCOUNT_SERVICE_NAME,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Admin APIs
  // ─────────────────────────────────────────────────────────────

  @Post('admin/offers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createOffer(@Body() body: any): Observable<any> {
    return this.discountService.createOffer(body);
  }

  @Patch('admin/offers/:id/toggle')
  @UseGuards(JwtAuthGuard, AdminGuard)
  toggleOffer(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ): Observable<any> {
    return this.discountService.toggleOffer({ id, isActive: body.isActive });
  }

  @Get('admin/offers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  listOffers(@Query('filter') filter?: string): Observable<any> {
    return this.discountService.listOffers({ filter: filter || 'all' });
  }

  // ─────────────────────────────────────────────────────────────
  // User APIs
  // ─────────────────────────────────────────────────────────────

  @Post('offers/validate-code')
  @UseGuards(JwtAuthGuard)
  validateCode(
    @CurrentUser() user: any,
    @Body() body: { code: string; originalPrice: number },
  ): Observable<any> {
    return this.discountService.validateCode({
      code: body.code,
      userId: user.userId,
      originalPrice: body.originalPrice,
    });
  }

  @Post('offers/check-eligibility')
  @UseGuards(JwtAuthGuard)
  checkEligibility(
    @CurrentUser() user: any,
    @Body() body: { originalPrice: number },
  ): Observable<any> {
    return this.discountService.checkEligibility({
      userId: user.userId,
      originalPrice: body.originalPrice,
    });
  }

  @Get('offers/history')
  @UseGuards(JwtAuthGuard)
  getOfferHistory(@CurrentUser() user: any): Observable<any> {
    return this.discountService.getOfferHistory({ userId: user.userId });
  }
}

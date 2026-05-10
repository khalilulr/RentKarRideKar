import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class Msg91Service {
    private readonly authKey: string | undefined;

    constructor(private readonly configService: ConfigService) {
        this.authKey = this.configService.get<string>('MSG91_AUTH_KEY');
    }

  async sendOtp(mobile: string, templateId: string) {
    const phone = mobile.replace('+', ''); 
    try {
        if(this.configService.get<string>('NODE_ENV') === 'development') {
            console.log(`Mock send OTP to ${phone} with template ${templateId}`);
            return { type: 'success', message: 'OTP sent (mock)' };
        }
      const response = await axios.post(`${this.configService.get<string>('MSG91_URL')}`, null, {
        params: {
          template_id: templateId,
          mobile: phone,
          authkey: this.authKey,
        },
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException('MSG91 Service Error');
    }
  }

  async verifyOtp(mobile: string, otp: string) {
    const phone = mobile.replace('+', '');
    try {
      if(this.configService.get<string>('NODE_ENV') === 'development') {
        console.log(`Mock verify OTP for ${phone} with OTP ${otp}`);
        return { type: 'success', message: 'OTP verified (mock)' };
      }
      const response = await axios.get(`${this.configService.get<string>('MSG91_URL')}/verify`, {
        params: { otp, mobile: phone, authkey: this.authKey },
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException('MSG91 Service Error');
    }
  }
}
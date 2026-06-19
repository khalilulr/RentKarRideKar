import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    if (!file) {
      console.error('[CloudinaryService] No file provided for upload');
      throw new Error('No file provided');
    }
    
    try {
      let response;
      if (file.buffer) {
        const base64File = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        response = await cloudinary.uploader.upload(base64File, {
          folder: 'rent-kar-ride-kar',
        });
      } else if (file.path) {
        response = await cloudinary.uploader.upload(file.path, {
          folder: 'rent-kar-ride-kar',
        });
      } else {
        console.error('[CloudinaryService] File object has neither buffer nor path:', file);
        throw new Error('File object has neither buffer nor path');
      }
      return response.secure_url;
    } catch (error) {
      console.error('[CloudinaryService] Error uploading file to Cloudinary:', error);
      throw error;
    }
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) {
      return [];
    }
    const uploadPromises = files.map((file) => this.uploadFile(file));
    return Promise.all(uploadPromises);
  }
}

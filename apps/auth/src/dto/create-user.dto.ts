import { IsNotEmpty, IsPhoneNumber, IsArray, IsEnum, IsOptional, MinLength } from 'class-validator';
import { Role } from "../enum/role.enum";

export class CreateUserDto {
    @IsNotEmpty({ message: 'Mobile number is required' })
    @IsPhoneNumber('IN', { message: 'Invalid Indian mobile number' })
    mobile: string;

    @IsOptional()
    @MinLength(3, { message: 'Name must be at least 3 characters long' })
    name?: string;

    @IsOptional()
    @IsArray()
    @IsEnum(Role, { each: true }) // Validates each item in the array is a valid Role
    roles?: Role[];

    @IsOptional()
    @IsEnum(Role,{each:true})
    activePerspective:Role

    
}
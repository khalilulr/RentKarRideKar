import { IsNotEmpty, IsString } from "class-validator";

export class jwtPayloadRefreshDTO {
    @IsNotEmpty()
    userId: string;

    @IsNotEmpty()
    @IsString()
    type: string;

}
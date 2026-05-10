import { isNotEmpty, IsNotEmpty, IsString } from "class-validator";
import { Role } from "../enum/role.enum";

export class jwtPayloadAccessDTO {
    @IsNotEmpty()
    userId: string;

    @IsNotEmpty()
    Roles: Role[];

    @IsNotEmpty()
    activePerspective: Role;

    @IsNotEmpty()
    @IsString()
    type: string;
}
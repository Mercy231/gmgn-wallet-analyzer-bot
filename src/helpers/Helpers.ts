import { DatabaseError, UniqueConstraintError, ValidationError } from "sequelize";

export const handleDataBaseError = (error: unknown) => {
    if (error instanceof ValidationError || error instanceof UniqueConstraintError) {
        return error.errors.map(e => e.message)[0];
    } else if (error instanceof DatabaseError) {
        console.error(error.message);
    } else {
        console.error(error);
    }
    
    return "An unknown server error occurred";
};

export const timeout = (ms: number) => new Promise((_) => setTimeout(_, ms));
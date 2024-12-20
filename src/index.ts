import dotenv from "dotenv";
dotenv.config();
import database from "./database/Database";
import TelegramService from "./services/telegram/TelegramService";

const main = async () => {
    try {
        await database.authenticate();
        await database.sync();

        TelegramService.start();
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(`Unknown error occurred: ${error}`);
        }

        process.exit(1);
    }
};

main();
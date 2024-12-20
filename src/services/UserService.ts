import { handleDataBaseError } from "../helpers/Helpers";
import User from "../models/UserModel";

class UserService {
    create = async (userdata: {
        telegram_id: string;
        first_name: string;
        last_name?: string;
        username?: string;
        wallet_address?: string;
    }) => {
        try {
            const user = await User.create(userdata);
            return user;
        } catch (error: unknown) {
            return handleDataBaseError(error);
        }
    };

    getByOneId = async (telegramId: string) => {
        try {
            const user = await User.findByPk(telegramId.toString());

            if (!user) {
                return "User not found";
            }

            return user;
        } catch (error: unknown) {
            return handleDataBaseError(error);
        }
    };

    update = async (telegramId: string, userdata: {
        first_name?: string;
        last_name?: string;
        username?: string;
        wallet_address?: string;
    }) => {
        try {
            const user = await User.findByPk(telegramId);

            if (!user) {
                return "User not found";
            }

            return await user.update(userdata);
        } catch (error: unknown) {
            return handleDataBaseError(error);
        }
    };
}

export default new UserService();
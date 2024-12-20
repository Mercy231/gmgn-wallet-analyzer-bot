import { Model, DataTypes } from "sequelize";
import database from "../database/Database";

class User extends Model {
    declare telegram_id: string;
    declare first_name: string;
    declare last_name: string | null;
    declare username: string | null;
    declare wallet_address: string | null;
}

User.init(
    {
        telegram_id: {
            primaryKey: true,
            autoIncrement: false,
            unique: true,
            allowNull: false,
            type: DataTypes.BIGINT
        },
        first_name: {
            unique: false,
            allowNull: true,
            defaultValue: null,
            type: DataTypes.STRING
        },
        last_name: {
            unique: false,
            allowNull: true,
            defaultValue: null,
            type: DataTypes.STRING
        },
        username: {
            unique: false,
            allowNull: true,
            defaultValue: null,
            type: DataTypes.STRING
        },
        wallet_address: {
            unique: false,
            allowNull: true,
            defaultValue: null,
            type: DataTypes.STRING
        }
    },
    {
        modelName: "User",
        tableName: "users",
        sequelize: database,
        timestamps: true
    }
);

export default User;
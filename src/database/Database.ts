import { Sequelize } from "sequelize";

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
}

const database = new Sequelize(process.env.DATABASE_URL, {
    logging: false
});

export default database;
import { Context, Scenes, Telegraf, session } from "telegraf";
import { InlineKeyboardMarkup, Message } from "telegraf/typings/core/types/typegram";
import { ExtraEditMessageText } from "telegraf/typings/telegram-types";
import { loginKeyboard, mainKeyboard, cancelKeyboard, getTotalProfitKeyboard } from "./keyboards";
import { PublicKey } from "@solana/web3.js";
import { ZenRows } from "zenrows";
import UserService from "../UserService";
import User from "../../models/UserModel";
import { GmgnWalletResponse, GmgnWalletToken } from "../../types/Interfaces";
import { FmtString } from "telegraf/typings/format";
import { timeout } from "../../helpers/Helpers";

if (!process.env.TELEGRAM_BOT_API_KEY) {
    console.error("TELEGRAM_BOT_API_KEY not set");
    process.exit(1);
}

if (!process.env.ZENROWS_API_KEY) {
    console.error("ZENROWS_API_KEY not set");
    process.exit(1);
}

export interface MySession extends Scenes.SceneSession {
    isActive?: boolean;
    walletAddress?: string;
    mainMsg?: Message.TextMessage;
    changeWalletMsg?: Message.TextMessage;
    total_profit?: {
        tokens?: GmgnWalletToken[];
        firstAddress?: string;
        firstIndex?: number;
        secondAddress?: string;
        secondIndex?: number;
        apiCursor?: string;
        sceneMsg?: Message.TextMessage;
    };

    // Old "Get_total_profit"
    tokens?: GmgnWalletToken[]
    tokensPage?: number; 
    apiCursor?: string; 
    firstSelectedTokenIndex?: number;
    secondSelectedTokenIndex?: number;
};

export interface MyContext extends Context {
    session: MySession;
	scene: Scenes.SceneContextScene<MyContext, Scenes.SceneSessionData>;
}

export type MsgArgsType = [
    text: string | FmtString,
    extra?: ExtraEditMessageText
];

class TelegramService {
    private getTotalProfitPageSize = 5;

    start = async () => {
        try {
            const changeWalletScene = new Scenes.BaseScene<MyContext>("change_wallet_scene");
            changeWalletScene.enter(async (ctx) => {
                try {
                    ctx.session.changeWalletMsg = await ctx.reply(
                        "<b>Send your Wallet address</b>",
                        { 
                            parse_mode: "HTML",
                            reply_markup: ctx.session.walletAddress 
                            ? cancelKeyboard : undefined
                        }
                    );
                } catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
            changeWalletScene.on("message", async (ctx) => {
                try {
                    try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
        
                    if (ctx.text && ctx.text.startsWith("/")) {           
                        await ctx.scene.leave();
                        bot.handleUpdate({
                            update_id: ctx.update.update_id,
                            message: ctx.update.message
                        });
                        return;
                    }
        
                    if (ctx.text === ctx.session.walletAddress) {
                        try {
                            await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                        } catch(_) {} finally {
                            ctx.session.changeWalletMsg = await ctx.reply(
                                "<b>This address is already connected. Try again</b>",
                                {
                                    parse_mode: "HTML",
                                    reply_markup: ctx.session.walletAddress 
                                    ? cancelKeyboard : undefined
                                }
                            );
                            return;
                        }
                    }
        
                    if (!ctx.text || !this.isValidSolanaAddress(ctx.text)) {
                        try {
                            await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                        } catch(_) {} finally {
                            ctx.session.changeWalletMsg = await ctx.reply(
                                "<b>Invalid wallet address. Try again</b>",
                                {
                                    parse_mode: "HTML",
                                    reply_markup: ctx.session.walletAddress 
                                    ? cancelKeyboard : undefined
                                }
                            );
                            return;
                        }
                    }
        
                    const user = await UserService.update(ctx.from.id.toString(), { wallet_address: ctx.text });
        
                    if (typeof user === "string") {
                        try {
                            await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                        } catch(_) {} finally {
                            await this.sendErrorMessage(ctx, user);
                            await ctx.scene.leave();
                            return;
                        }
                    }
        
                    ctx.session.walletAddress = user.wallet_address as string;
        
                    try {
                        await bot.telegram.editMessageText(
                            ctx.chat.id,
                            ctx.session.mainMsg?.message_id,
                            undefined,
                            `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`,
                            {
                                parse_mode: "HTML",
                                reply_markup: mainKeyboard
                            }
                        );
                    } catch (error: any) {
                        let message: string;
                        let keyboard: InlineKeyboardMarkup;
        
                        if (ctx.session.walletAddress) {
                            message = `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`;
                            keyboard = mainKeyboard;
                        } else {
                            message = "<b>Welcome to Solana Wallet Analyzer Bot!</b>\n\n<i>Connect your Wallet to continue</i>"
                            keyboard = loginKeyboard;
                        }
        
                        ctx.session.mainMsg = await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
                    } finally {
                        await ctx.scene.leave();
                    }
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
            changeWalletScene.action("cancel", async (ctx) => {
                try {
                    ctx.scene.leave();
                } catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
            changeWalletScene.leave(async (ctx) => {
                try {
                    await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                } catch(_) {} finally {
                    return;
                }
            });
    
            const totalProfitScene = new Scenes.BaseScene<MyContext>("total_profit_scene");
            totalProfitScene.enter(async (ctx) => {
                if (ctx.session.total_profit === undefined) {
                    ctx.session.total_profit = {};
                }
    
                ctx.session.total_profit.sceneMsg = await ctx.reply(
                    "<b>Send the First token address</b>",
                    {
                        parse_mode: "HTML",
                        reply_markup: cancelKeyboard
                    }
                );
            });
            totalProfitScene.action("cancel", async (ctx) => {
                await ctx.scene.leave();
            });
            totalProfitScene.on("message", async (ctx) => {
                try { 
                    if (ctx.session.total_profit === undefined) {
                        await ctx.scene.leave();
                        return;
                    }
        
                    if (ctx.text === undefined) {
                        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
                        try { await ctx.deleteMessage(ctx.session.total_profit.sceneMsg?.message_id); } catch (_) {}
                        
                        ctx.session.total_profit.sceneMsg = await ctx.reply(
                            "<b>Invalid token address. Try again</b>",
                            {
                                parse_mode: "HTML",
                                reply_markup: cancelKeyboard
                            }
                        );
                        
                        return;
                    }
        
                    if (ctx.text.startsWith("/")) {        
                        await ctx.scene.leave();
                        bot.handleUpdate({
                            update_id: ctx.update.update_id,
                            message: ctx.update.message
                        });
                        return;
                    }
        
                    if (!this.isValidSolanaAddress(ctx.text)) {
                        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
                        try { await ctx.deleteMessage(ctx.session.total_profit.sceneMsg?.message_id); } catch (_) {}
                        
                        ctx.session.total_profit.sceneMsg = await ctx.reply(
                            "<b>Invalid token address. Try again</b>",
                            {
                                parse_mode: "HTML",
                                reply_markup: cancelKeyboard
                            }
                        );
                        
                        return;
                    }
        
                    try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
                    try { await ctx.deleteMessage(ctx.session.total_profit.sceneMsg?.message_id); } catch (_) {}
                    ctx.session.total_profit.sceneMsg = await ctx.reply(
                        "<b>Loading... Please, wait</b>",
                        {
                            parse_mode: "HTML",
                        }
                    );
        
                    const walletAddress = ctx.session.walletAddress ?? "";
        
                    ctx.session.total_profit.apiCursor = ctx.session.total_profit.apiCursor ?? "";
                    ctx.session.total_profit.tokens = ctx.session.total_profit.tokens ?? [];

                    if (ctx.session.total_profit.tokens.length < 1) {
                        let walletData = await this.getRecentPnlTokens(walletAddress);
            
                        while (walletData === null) {
                            walletData = await this.getRecentPnlTokens(walletAddress);
                        }
        
                        ctx.session.total_profit.tokens = walletData.holdings;
                        ctx.session.total_profit.apiCursor = walletData.next;
                    }
        
                    if (ctx.session.total_profit.firstIndex !== undefined) {
                        ctx.session.total_profit.secondAddress = ctx.text;
                        let secondIndex = -1;
                        while (ctx.session.total_profit.apiCursor || ctx.session.total_profit.apiCursor === "") {  
                            secondIndex = ctx.session.total_profit.tokens.findIndex(
                                token => token.token.token_address === ctx.session.total_profit?.secondAddress
                            );                    
            
                            if (secondIndex === -1 && ctx.session.total_profit.apiCursor.length > 1) {
                                let walletData = await this.getRecentPnlTokens(walletAddress, ctx.session.total_profit.apiCursor);
            
                                while (walletData === null) {
                                    walletData = await this.getRecentPnlTokens(walletAddress, ctx.session.total_profit.apiCursor);
                                }
        
                                ctx.session.total_profit.tokens.push(...walletData.holdings);
                                ctx.session.total_profit.apiCursor = walletData.next;
                                continue;
                            }
            
                            ctx.session.total_profit.secondIndex = secondIndex;
                            break;
                        }
        
                        if (ctx.session.total_profit.secondIndex === -1 || ctx.session.total_profit.secondIndex === undefined) {
                            try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {};
                            try { await ctx.deleteMessage(ctx.session.total_profit?.sceneMsg?.message_id); } catch (_) {};
                            ctx.session.total_profit.sceneMsg = await ctx.reply(
                                `<b>First address:</b>\n<i>${ctx.session.total_profit.firstAddress}</i>\n\n<b>No such address. Try again</b>`,
                                {
                                    parse_mode: "HTML",
                                    reply_markup: cancelKeyboard
                                }
                            );
                            return;
                        }
        
                        let totalProfit: any = this.calculateTotalProfitSum(
                            ctx.session.total_profit.tokens,
                            ctx.session.total_profit.firstIndex,
                            secondIndex
                        );
        
                        totalProfit = totalProfit.toFixed(2);
                        totalProfit = totalProfit.startsWith("-") ? `-$${totalProfit.slice(1)}` : `+$${totalProfit}`
        
                        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {};
                        try { await ctx.deleteMessage(ctx.session.total_profit?.sceneMsg?.message_id); } catch (_) {};
                        let message = `<b>First address:</b>\n<i>${ctx.session.total_profit.firstAddress}</i>\n\n<b>Second address:</b>\n<i>${ctx.session.total_profit.secondAddress}</i>\n\n`;
                        message += `Total profit:  <b>${totalProfit}</b>`
        
                        await ctx.reply(
                            message,
                            {
                                parse_mode: "HTML",
                            }
                        );
                        await ctx.scene.leave();
                        return;
                    }
        
                    ctx.session.total_profit.firstAddress = ctx.text;
                    let firstIndex = -1;
        
                    while (ctx.session.total_profit.apiCursor || ctx.session.total_profit.apiCursor === "") {
                        firstIndex = ctx.session.total_profit.tokens.findIndex(
                            token => token.token.token_address === ctx.session.total_profit?.firstAddress
                        );
        
                        if (firstIndex === -1 && ctx.session.total_profit.apiCursor.length > 1) {
                            let walletData = await this.getRecentPnlTokens(walletAddress, ctx.session.total_profit.apiCursor);
            
                            while (walletData === null) {
                                walletData = await this.getRecentPnlTokens(walletAddress, ctx.session.total_profit.apiCursor);
                            }
            
                            ctx.session.total_profit.tokens.push(...walletData.holdings);
                            ctx.session.total_profit.apiCursor = walletData.next;
                            continue;
                        }
        
                        ctx.session.total_profit.firstIndex = firstIndex;
                        break;
                    }
        
                    if (ctx.session.total_profit.firstIndex === -1 || ctx.session.total_profit.firstIndex === undefined) {
                        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {};
                        try { await ctx.deleteMessage(ctx.session.total_profit?.sceneMsg?.message_id); } catch (_) {};
                        ctx.session.total_profit.sceneMsg = await ctx.reply(
                            "<b>No such address. Try again</b>",
                            {
                                parse_mode: "HTML",
                                reply_markup: cancelKeyboard
                            }
                        );
                        return;
                    }
        
                    try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {};
                    try { await ctx.deleteMessage(ctx.session.total_profit?.sceneMsg?.message_id); } catch (_) {};
                    ctx.session.total_profit.sceneMsg = await ctx.reply(
                        `<b>First address:</b>\n<i>${ctx.session.total_profit.firstAddress}</i>\n\n<b>Send the Second token address</b>`,
                        {
                            parse_mode: "HTML",
                            reply_markup: cancelKeyboard
                        }
                    );
                    return;
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
            totalProfitScene.leave(async (ctx) => {
                try {
                    await ctx.deleteMessage(ctx.message?.message_id);
                } catch(_) {} finally {
                    ctx.session.total_profit = undefined;
                }
            });
    
            const bot = new Telegraf<MyContext>(process.env.TELEGRAM_BOT_API_KEY ?? "");
    
            const stage = new Scenes.Stage<MyContext>([
                changeWalletScene,
                totalProfitScene
            ]);
    
            bot.use(session());
            bot.use(stage.middleware());
    
            bot.use(async (ctx, next) => {
                try {
                    if (ctx.session.isActive) {
                        return next();
                    }
        
                    if (ctx.from === undefined) {
                        return next();
                    }
        
                    const user = await UserService.getByOneId(ctx.from.id.toString());
        
                    if (user instanceof User) {
                        ctx.session = {
                            isActive: true,
                            walletAddress: user.wallet_address ?? undefined 
                        };
                        return next();
                    }
        
                    const newUser = await UserService.create({
                        telegram_id: ctx.from.id.toString(),
                        first_name: ctx.from.first_name,
                        last_name: ctx.from.last_name,
                        username: ctx.from.username,
                    });
        
                    if (typeof newUser === "string") {
                        console.error(newUser);
                        
                        await ctx.reply("Error: " + newUser);
        
                        return next();
                    }
        
                    ctx.session = { isActive: true };
                    return next();
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
          
            bot.command("start", async (ctx) => {
                try {
                    ctx.session.tokens = undefined;
                    ctx.session.firstSelectedTokenIndex = undefined;
                    ctx.session.secondSelectedTokenIndex = undefined;
                    ctx.session.tokensPage = undefined;
        
                    let message: string;
                    let keyboard: InlineKeyboardMarkup;
        
                    if (ctx.session.walletAddress) {
                        message = `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`;
                        keyboard = mainKeyboard;
                    } else {
                        message = "<b>Welcome to Solana Wallet Analyzer Bot!</b>\n\n<i>Connect your Wallet to continue</i>"
                        keyboard = loginKeyboard;
                    }
        
                    ctx.session.mainMsg = await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
    
            bot.command("total_profit", async (ctx) => {
                const walletAddress = ctx.session.walletAddress;
        
                if (walletAddress === undefined) {
                    await ctx.reply("<b>Connect your wallet first</b>", {parse_mode: "HTML"});
                    return;
                }

                await ctx.scene.enter("total_profit_scene");
            });
    
            bot.action("change_wallet", async (ctx) => {
                try {
                    ctx.session.tokens = undefined;
                    
                    await ctx.scene.enter("change_wallet_scene");
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
    
            bot.action("total_profit", async (ctx) => {
                const walletAddress = ctx.session.walletAddress;
    
                if (walletAddress === undefined) {
                    await ctx.answerCbQuery("Connect your Wallet first", {cache_time: 8});
                    return;
                }
                
                await ctx.scene.enter("total_profit_scene");
            });
    
            bot.action("cancel", async (ctx) => {
                try {
                    ctx.session.tokens = undefined;
                    ctx.session.firstSelectedTokenIndex = undefined;
                    ctx.session.secondSelectedTokenIndex = undefined;
        
                    await ctx.editMessageText(
                        `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`,
                        {
                            parse_mode: "HTML",
                            reply_markup: mainKeyboard
                        }
                    );
                }  catch (error: any) {
                    console.error(error);
                    console.error(error.message);
                }
            });
    
            bot.launch();
        } catch (e: unknown) {
            if (e instanceof Error) {
                console.error(e.message);
            } else {
                console.error(e);
            }
            console.error("Start method ERROR");
            await timeout(5000);
            this.start();
        }
    };

    sendErrorMessage = async (ctx: MyContext, error: string) => {
        let message = `<b>Unknown error occurred:</b>\n<code>${error}</code>\n\n`;
        message += "<b>Send this message to Admin to fix the problem!</b>"
        return await ctx.reply(message, { parse_mode: "HTML" });
    };

    isValidSolanaAddress = (address: string) => {
        try {
            new PublicKey(address);
            return true;
        } catch (error: unknown) {
            return false;
        }
    };

    getRecentPnlTokens = async (walletAddress: string, cursor?: string) => {
        try {
            let params = "?limit=50&orderby=last_active_timestamp&direction=desc&showsmall=true&sellout=true&tx30d=true"
    
            if (cursor) {
                params += `&cursor=${cursor}`
            }
    
            const url = `https://gmgn.ai/api/v1/wallet_holdings/sol/${walletAddress}`;
            const client = new ZenRows(process.env.ZENROWS_API_KEY ?? "");
            const response = await client.get(url + params, { js_render: true, json_response: true });
            const htmlString = await response.text();
            const jsonResponse = JSON.parse(htmlString);

            if (!jsonResponse.html) {
                throw new Error(jsonResponse.detail);
            }

            const jsonGmgnData: GmgnWalletResponse = JSON.parse(jsonResponse.html);

            return jsonGmgnData.data;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(`Unknown error occurred: ${error}`);
            }

            return null;
        }
    };

    calculateTotalProfitSum = (
        tokens: GmgnWalletToken[], 
        startIndex: number, 
        endIndex: number
    ) => {
        if (startIndex > endIndex) {
            [startIndex, endIndex] = [endIndex, startIndex];
        }
    
        return tokens
            .slice(startIndex, endIndex + 1)
            .reduce((sum, token) => {
                const totalProfit = parseFloat(token.total_profit);
                return sum + (isNaN(totalProfit) ? 0 : totalProfit);
            }, 0);
    }
}

export default new TelegramService();
// ======================================================================
// 必要なライブラリのインポートと初期化
// ======================================================================
const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');

// 環境変数から各種キーを取得
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const lineClient = new line.Client(config);

// Google Apps Script (GAS) のWebアプリケーションURL
const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;

// 応答メッセージのテンプレート
const REPLY_MESSAGES = {
    welcome: "AI家庭教師くんへようこそ！あなたの学びを全力でサポートします。\nまずはいくつかの質問に答えて、あなただけの家庭教師をカスタマイズしましょう！",
    askGrade: "まずはあなたの学年を教えてください！\n\n「小学生」「中学生」「高校生」「大学生」「社会人」の中から選んで返信してくださいね。",
    askGender: "性別を教えてください。\n\n「男性」「女性」「その他」の中から選んで返信してください。",
    askRegion: "お住まいの地域を教えてください。\n例: 東京都、大阪府、北海道",
    askWeakSubject: "苦手な科目はありますか？複数回答もOKです。\n例: 数学、英語、国語、理科、社会",
    askHowKnown: "AI家庭教師くんをどこで知りましたか？\n例: HP、Instagram、X、TikTok、検索、チラシ、紹介",
    askTermsOfService: "ヒアリングにご協力ありがとうございます！\nAI家庭教師くんの利用には、利用規約への同意が必要です。\n以下のURLから内容をご確認ください。\n[利用規約URLをここに貼る]\n\n内容に同意いただけたら「同意する」と返信してください。",
    termsAccepted: "ありがとうございます！利用規約に同意いただきました。\n無料期間がスタートしました！\n本日より5日間、AI家庭教師くんを無料でご利用いただけます。",
    rehearingComplete: "再設定が完了しました！ありがとう。",
    trialEndMessage: "無料期間が終了しました。\n引き続きご利用いただくには、有料プランへのアップグレードが必要です。\n「500円」とメッセージを送信して、アップグレード手続きに進んでください。",
    upgradePrompt: "無制限プランへのアップグレードはこちらからどうぞ！\n[決済ページURLをここに貼る]",
    error: "ごめんなさい、エラーが発生しました。もう一度お試しください。",
    invalidInput: "すみません、入力内容が理解できませんでした。正しい形式で入力してくださいね。",
    upgradeInstructions: "無制限プランへのお申し込みは、[決済ページURLをここに貼る] からお願いします。",
    alreadyAgreed: "すでに利用規約には同意済みです。ご利用ありがとうございます！",
    askExamDate: "試験日を教えてください。例：2025年8月3日"
};

// ======================================================================
// Google Apps Script (GAS) 連携関数
// ======================================================================
async function updateSpreadsheet(userId, data) {
    try {
        // ↓ デバッグ用のログ
        console.log(`これからGASを呼び出します。Action: updateUser, UserID: ${userId}`);
        
        await axios.post(GAS_WEB_APP_URL, {
            action: 'updateUser',
            userId: userId,
            data: data
        });
        console.log('スプレッドシート更新成功:', userId, data);
        return true;
    } catch (error) {
        // ↓ エラーの詳細を表示するためのログ
        console.error('スプレッドシート更新エラーの詳細:', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getSpreadsheetData(userId) {
    try {
        const response = await axios.get(GAS_WEB_APP_URL, {
            params: { action: 'getUser', userId: userId }
        });
        return response.data;
    } catch (error) {
        console.error('スプレッドシート取得エラー:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getFaqAnswer(question) {
    try {
        const response = await axios.get(GAS_WEB_APP_URL, {
            params: { action: 'getFaq', question: question }
        });
        return response.data.answer;
    } catch (error) {
        console.error('FAQ取得エラー:', error.response ? error.response.data : error.message);
        return null;
    }
}

// ======================================================================
// OpenAI (AI家庭教師) 連携関数
// ======================================================================
async function getAiResponse(userData, messageText, messageType = 'text', imageUrl = null) {
    const userGrade = userData.grade || '中学生・高校生';
    const userWeakSubject = userData.weak_subject || '特に無し';

    let prompt = `あなたは「AI家庭教師くん」という名前の親しみやすい塾講師です。
    生徒の${userGrade}に向けた言葉遣いをし、小さなことにも気づいて褒め、前向きな気持ちになるようにサポートしてください。
    特に、生徒が質問から学習指導要領のどこでつまずいているかを推測し、具体的に分かりやすく教えてください。
    現在の生徒の苦手科目は${userWeakSubject}です。この情報も考慮してください。`;

    const messages = [
        { role: "system", content: prompt },
    ];

    if (messageType === 'image' && imageUrl) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: messageText || "画像に関する質問です。" },
                { type: "image_url", image_url: { url: imageUrl } }
            ]
        });
    } else {
        messages.push({ role: "user", content: messageText });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 500,
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI API エラー:", error.response ? error.response.data : error.message);
        return "ごめんなさい、今はうまく考えられないようです。もう一度質問してください。";
    }
}

// ======================================================================
// LINE Webhookハンドラー (Vercelはこれを実行する)
// ======================================================================
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    // 1. 先にLINEへ「OK」を返す
    res.status(200).send('OK');

    // 2. その後、時間のかかる処理を実行する
    try {
        const body = JSON.stringify(req.body);
        const signature = req.headers['x-line-signature'];
        const expectedSignature = crypto.createHmac('sha256', config.channelSecret)
                                      .update(body).digest('base64');
        if (signature !== expectedSignature) {
            console.error("署名検証エラー");
            return; // OKを返した後なので、returnで処理を終了
        }

        const events = req.body.events;
        for (const event of events) {
            if (event.type === 'message' || event.type === 'follow') {
                // handleEventの実行を待たない（ノンブロッキング）
                handleEvent(event);
            }
        }
    } catch (err) {
        console.error('Webhook処理全体のエラー:', err);
    }
};

// ======================================================================
// イベント処理のメインロジック
// ======================================================================
async function handleEvent(event) {
    try {
        const userId = event.source.userId;
        if (!userId) return;

        if (event.type === 'follow') {
            const profile = await lineClient.getProfile(userId);
            const initialData = {
                line_id: userId,
                account_name: profile.displayName,
                status: 'hearing_grade'
            };
            await updateSpreadsheet(userId, initialData);
            await lineClient.replyMessage(event.replyToken, [
                { type: 'text', text: REPLY_MESSAGES.welcome },
                { type: 'text', text: REPLY_MESSAGES.askGrade }
            ]);
            return;
        }

        if (event.type === 'message') {
            const userData = await getSpreadsheetData(userId) || {};
            const userStatus = userData.status || '';
            const messageText = event.message.type === 'text' ? event.message.text : '';
            let replyMessage = '';
            let dataToUpdate = {};

            // (中略：ヒアリングやキーワード処理などのロジックは省略しています。
            // 以前のコードと同じものがここにあると思ってください)
            
            // --- 特定キーワードの処理 ---
            if (messageText === '再設定') {
                dataToUpdate = { status: 'hearing_grade' };
                replyMessage = REPLY_MESSAGES.askGrade;
            } // ...その他のif-else...

            // --- 通常の会話・画像処理 ---
            else if (event.message.type === 'text') {
                const faqAnswer = await getFaqAnswer(messageText);
                replyMessage = faqAnswer ? faqAnswer : await getAiResponse(userData, messageText);
            } else if (event.message.type === 'image') {
                 const imageUrl = `https://api-data.line.me/v2/bot/message/${event.message.id}/content`;
                 replyMessage = await getAiResponse(userData, "この画像について解説してください。", "image", imageUrl);
            } else {
                replyMessage = "テキストメッセージか画像を送ってね！";
            }
            
            if (Object.keys(dataToUpdate).length > 0) {
                await updateSpreadsheet(userId, dataToUpdate);
            }
            if (replyMessage) {
                await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyMessage });
            }
        }
    } catch (err) {
        console.error('イベント処理エラー:', err);
        if (event.replyToken) {
            await lineClient.replyMessage(event.replyToken, { type: 'text', text: REPLY_MESSAGES.error }).catch(e => console.error("エラー返信失敗:", e));
        }
    }
}
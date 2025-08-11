// lib/google-sheet.jsから必要なものをすべてインポート
const { updateSpreadsheet, getSpreadsheetData, getFaqAnswer, REPLY_MESSAGES } = require('../lib/google-sheet.js');

// lib/line-sdk.jsから必要なものをインポート
const { lineClient, config } = require('../lib/line-sdk.js'); // ← configを追加

// lib/openai-client.jsから必要なものをインポート
const { getAiResponse } = require('../lib/openai-client.js'); // ← この行を丸ごと追加

const crypto = require('crypto');
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
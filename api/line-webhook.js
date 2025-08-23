// lib/google-sheet.jsから必要なものをすべてインポート
const { updateSpreadsheet, getSpreadsheetData, getFaqAnswer, REPLY_MESSAGES } = require('../lib/google-sheet.js');
// lib/line-sdk.jsから必要なものをインポート
const { lineClient, config } = require('../lib/line-sdk.js');
// lib/openai-client.jsから必要なものをインポート
const { getAiResponse } = require('../lib/openai-client.js');
// Node.jsの標準ライブラリ
const crypto = require('crypto');

// ======================================================================
// LINE Webhookハンドラー (Vercelはこれを実行する)
// ======================================================================
module.exports = async (req, res) => {
    // POST以外のリクエストは無視
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    // 1. 先にLINEへ「OK」を返し、タイムアウトを防ぐ
    res.status(200).send('OK');

    // 2. その後、時間のかかる処理をバックグラウンドで実行する
    try {
        const body = JSON.stringify(req.body);
        const signature = req.headers['x-line-signature'];

        // 署名を検証
        const expectedSignature = crypto.createHmac('sha256', config.channelSecret)
                                      .update(body).digest('base64');
        if (signature !== expectedSignature) {
            console.error("署名検証エラー");
            return; // OKを返した後なので、returnで処理を終了
        }

        // イベントを一つずつ処理
        const events = req.body.events;
        for (const event of events) {
            if (event.type === 'message' || event.type === 'follow') {
                // handleEventの完了を待たずに実行（ノンブロッキング）
                handleEvent(event).catch(err => console.error('HandleEvent Error:', err));
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

        // --- フォローイベントの処理 ---
        if (event.type === 'follow') {
            const profile = await lineClient.getProfile(userId);
            const initialData = {
                line_id: userId,
                account_name: profile.displayName,
                status: 'hearing_grade' // ヒアリングの最初のステップを記録
            };
            await updateSpreadsheet(userId, initialData);
            
            // 挨拶と最初の質問を送信
            await lineClient.replyMessage(event.replyToken, [
                { type: 'text', text: REPLY_MESSAGES.welcome },
                { type: 'text', text: REPLY_MESSAGES.askGrade }
            ]);
            return;
        }

        // --- メッセージイベントの処理 ---
        if (event.type === 'message') {
            const userData = await getSpreadsheetData(userId) || {};
            const messageText = event.message.type === 'text' ? event.message.text : '';
            let dataToUpdate = {};

            // --- 特定キーワードの処理 ---
            if (messageText === '再設定') {
                dataToUpdate = { status: 'hearing_grade' };
                await updateSpreadsheet(userId, dataToUpdate);
                await lineClient.replyMessage(event.replyToken, { type: 'text', text: REPLY_MESSAGES.askGrade });
                return;
            } 
            else if (messageText === '500円') {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [{
                        price: process.env.STRIPE_PRICE_ID,
                        quantity: 1,
                    }],
                    mode: 'subscription',
                    success_url: 'https://liff.line.me/2007938295-pkw8rN7e', // LIFFアプリ登録後に設定
                    cancel_url: 'https://liff.line.me/2007938295-pkw8rN7e',  // LIFFアプリ登録後に設定
                    client_reference_id: userId, // 誰の決済か紐付けるためにLINEのユーザーIDを渡す
                });

                // ボタン付きのメッセージを作成して返信
                const buttonsMessage = {
                    type: 'template',
                    altText: 'プランのアップグレード',
                    template: {
                        type: 'buttons',
                        text: '無制限プランにアップグレードします。以下のボタンから決済ページにお進みください。',
                        actions: [{
                            type: 'uri',
                            label: '決済ページに進む',
                            uri: session.url
                        }]
                    }
                };
                await lineClient.replyMessage(event.replyToken, buttonsMessage);
                return; 
            }
            
            // --- ヒアリングフローや通常の会話処理 ---
            // (ここに学年→性別→...と続くヒアリングのロジックや、通常のAI応答のロジックが入ります)
            
            // --- (仮) 通常の会話・画像処理 ---
            let replyMessageText = '';
            if (event.message.type === 'text') {
                const faqAnswer = await getFaqAnswer(messageText);
                replyMessageText = faqAnswer || await getAiResponse(userData, messageText);
            } else if (event.message.type === 'image') {
                const imageUrl = `https://api-data.line.me/v2/bot/message/${event.message.id}/content`;
                replyMessageText = await getAiResponse(userData, "この画像について解説してください。", "image", imageUrl);
            } else {
                replyMessageText = "テキストメッセージか画像を送ってね！";
            }
            
            if (replyMessageText) {
                await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyMessageText });
            }
        }
    } catch (err) {
        console.error('イベント処理の詳細エラー:', err);
        // エラーが発生しても、ユーザーに何か返信する
        if (event.replyToken) {
            try {
                await lineClient.replyMessage(event.replyToken, { type: 'text', text: REPLY_MESSAGES.error });
            } catch (replyErr) {
                console.error("エラーメッセージの返信に失敗:", replyErr);
            }
        }
    }
}

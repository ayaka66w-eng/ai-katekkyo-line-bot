const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { updateSpreadsheet } = require('../lib/google-sheet');

// Stripeの署名を検証するために、リクエストの生データを取得する設定
export const config = {
    api: {
        bodyParser: false,
    },
};

// 生のボディを取得するためのヘルパー関数
async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const buf = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // 署名を検証し、イベントを構築
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook署名検証エラー: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // イベントの種類に応じて処理を分岐
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            const userId = session.client_reference_id; // 決済ページ生成時に渡したLINEのID
            const stripeCustomerId = session.customer;

            console.log(`決済完了: userId=${userId}, stripeId=${stripeCustomerId}`);
            
            try {
                // スプレッドシートの情報を更新
                await updateSpreadsheet(userId, { 
                    plan_status: 'paid', 
                    stripe_customer_id: stripeCustomerId 
                });
                console.log(`ユーザー(${userId})のステータスをpaidに更新しました。`);
            } catch (dbError) {
                console.error(`スプレッドシート更新エラー:`, dbError);
                // ここでエラーが発生してもStripeには200を返すのが一般的
            }
            break;

        // 将来的に解約処理を追加する場合はここに記述
        // case 'customer.subscription.deleted':
        //     ...
        //     break;

        default:
            console.warn(`未処理のイベントタイプ: ${event.type}`);
    }

    // Stripeに正常に受信したことを通知
    res.status(200).send({ received: true });
}

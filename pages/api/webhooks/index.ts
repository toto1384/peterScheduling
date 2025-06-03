import { createWebhook, deleteWebhook, formJWTCorePlus, listWebhooks, url } from "@/utils/db"
import { NextApiRequest } from "next"


export const targetBase = `${url}/api`

export default async function handler(req: NextApiRequest, res: any) {


    if (req.method == "POST") {
        const webHooks = await listWebhooks()
        const scheduled = await createWebhook('appointment.scheduled', `${targetBase}/appointment/scheduled`, { checkExisting: true, webHooks })
        const rescheduled = await createWebhook('appointment.rescheduled', `${targetBase}/appointment/rescheduled`, { checkExisting: true, webHooks })
        // const changed = await createWebhook('appointment.changed', `${targetBase}/appointment/changed`, { checkExisting: true, webHooks })
        const canceled = await createWebhook('appointment.canceled', `${targetBase}/appointment/canceled`, { checkExisting: true, webHooks })

        return res.json({ s: `created webhooks`, scheduled, rescheduled, canceled },)
    }

    if (req.method == "GET") {

        // const endPointLocations = 'https://sandbox.coreplus.com.au/API/Core/v2.1/location/'

        // const endPoint = 'https://sandbox.coreplus.com.au/API/Core/v2.1/appointment/?startDate=2025-05-20&endDate=2025-05-30&timezoneId=39d62534-501c-49cd-9da9-6fa8d6a81f48'
        // const method = 'GET'
        // const headers = {
        //     'Authorization': 'JwToken ' + formJWTCorePlus({ method, endPoint: endPoint }),
        //     'content-type': 'application/json'
        // };
        // const response = await fetch(endPoint, { method, headers, });

        // const json = await response.json()

        // console.log("🚀 ~ handler ~ response:", json)

        const webhooks = await listWebhooks()

        return res.json(webhooks)
    }

    if (req.method == 'DELETE') {
        const webhooks = await listWebhooks()
        for (const webhook of webhooks) {
            const deleteWebhooks = await deleteWebhook(webhook.id)

        }

        return res.json({ "success": true, message: `Deleted ${webhooks.length} webhooks` })
    }
}
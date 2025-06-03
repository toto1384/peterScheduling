

import { deleteWebhook } from "@/utils/db"
import { NextApiRequest } from "next"


export default async function handler(req: NextApiRequest, res: any) {


    if (req.method == "DELETE") {

        const deleted = deleteWebhook(req.query.id as string)

        return res.json({ s: `deleted webhook`, deleted, })
    }

}
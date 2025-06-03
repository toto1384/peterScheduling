import mongoose, { Document, Model, Schema, } from 'mongoose'
import zodToJsonSchema from "zod-to-json-schema";
import { createMongooseSchema } from 'convert-json-schema-to-mongoose';
import { z, ZodTypeAny } from 'zod'
import { SaveActionObject } from './types';
import jwt from 'jsonwebtoken';
import { addMinutes, format, parse, parseISO, toDate } from 'date-fns';
import { enAU } from "date-fns/locale"
// export const url = 'https://a715-86-124-188-183.ngrok-free.app'
export const url = 'http://209.38.87.232'
export const authAcuity = 'Basic ' + Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64')
export const headersAcuity = { accept: 'application/json', 'Authorization': authAcuity }

export const VALID_EVENTS = [
    'appointment.scheduled',
    'appointment.rescheduled',
    'appointment.canceled',
    'appointment.changed',
    'order.completed'
] as const;


export function convertAcuityToCorePlus(acuityDateString: string, add?: { interval: "minutes", num: number }) {
    // 1. Parse the Acuity Date (important to include the timezone)
    let acuityDate = parseISO(acuityDateString,);

    if (add && add.interval == 'minutes') acuityDate = addMinutes(acuityDate, add.num)


    const corePlusDateString = format(acuityDate, "yyyy-MM-dd'T'HH:mm:ssXXX").replace(/Z$/, '+00:00');
    console.log("🚀 ~ convertAcuityToCorePlus ~ corePlusDateString:", acuityDate.getTimezoneOffset(), corePlusDateString)

    console.log('Input acuityDate:', acuityDate);
    console.log('System timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log('Date object:', new Date(acuityDate));
    console.log('Formatted result:', format(new Date(acuityDate), "yyyy-MM-dd'T'HH:mm:ssXXX"));

    // // 2. Convert to the CorePlus Timezone (+10:00)
    // const corePlusDate = utcToZonedTime(acuityDate, 'Australia/Sydney'); // Use a specific IANA timezone

    // // 3. Format the output string
    // const corePlusDateString = format(corePlusDate, "yyyy-MM-dd'T'HH:mm+10:00");

    return corePlusDateString;
}

export function convertAcuityToDate(acuityDateString: string, add?: { interval: "minutes", num: number }) {
    // 1. Parse the Acuity Date (important to include the timezone)
    let acuityDate = parseISO(acuityDateString,);

    if (add && add.interval == 'minutes') acuityDate = addMinutes(acuityDate, add.num)

    return acuityDate;
}


export function formJWTCorePlus({ endPoint, method }: { endPoint: string, method: string }) {
    // API configuration
    const app_consumer_id = process.env.COREPLUS_CONSUMER_ID;
    const app_consumer_secret = process.env.COREPLUS_SECRET!;
    const app_access_token = process.env.COREPLUS_ACCESS_TOKEN;

    const now = Math.floor(Date.now() / 1000);
    const claims = {
        "iss": url,
        "aud": "https://corepluspm.com",
        "nbf": now,
        "exp": now + 60, // Add 60 seconds
        "consumerId": app_consumer_id,
        "accessToken": app_access_token,
        "url": endPoint,
        "httpMethod": method
    };

    // create the JWT token
    const jwt_str = jwt.sign(claims, app_consumer_secret, { algorithm: 'HS256' });

    return jwt_str
}

// Error handler
const handleError = (error: any, action: any) => {
    if (error.response) {
        const errorInfo = {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
        };

        console.error(`Error ${action}:`, errorInfo);

        const errorMessages: any = {
            400: 'Bad Request - Check your parameters or webhook limit (max 25 webhooks)',
            401: 'Unauthorized - Check your API credentials',
            404: 'Not Found - Webhook ID may not exist'
        };

        if (errorMessages[error.response.status]) {
            console.error(errorMessages[error.response.status]);
        }
    } else {
        console.error(`Network error ${action}:`, error.message);
    }
};

// Create webhook function
export const createWebhook = async (
    event: typeof VALID_EVENTS[number], target: string, options?: { checkExisting: boolean, webHooks: { id: string, event: string, target: string, status: string }[] }
) => {

    if (!VALID_EVENTS.includes(event)) {
        throw new Error(`Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}`);
    }

    if (options?.checkExisting && options.webHooks.find(i => i.event == event && i.target == target && i.status == 'active')) {
        return { success: false, message: 'Already Created Webhook' }
    } else try {
        // const response = await fetch('https://acuityscheduling.com/api/v1/appointment-types?includeDeleted=false', { method: 'GET', headers: headersAcuity, })
        const response = await fetch('https://acuityscheduling.com/api/v1/webhooks', { method: 'POST', headers: headersAcuity, body: JSON.stringify({ event, target }) })

        const json = await response.json()
        console.log('Webhook created successfully:', json);
        return { success: true, data: json };
    } catch (error) {
        handleError(error, 'creating webhook');
        throw error;
    }
};

// List webhooks function
export const listWebhooks = async () => {
    try {
        const response = await fetch('https://acuityscheduling.com/api/v1/webhooks', { method: 'GET', headers: headersAcuity })

        const json = await response.json()
        return json;
    } catch (error) {
        handleError(error, 'listing webhooks');
        throw error;
    }
};

// Delete webhook function
export const deleteWebhook = async (webhookId: string) => {
    try {
        const response = await fetch(`https://acuityscheduling.com/api/v1/webhooks/${webhookId}`, { method: 'DELETE', headers: headersAcuity })

        console.log(`Webhook ${webhookId} deleted successfully`);
        return true;
    } catch (error) {
        handleError(error, `deleting webhook ${webhookId}`);
        throw error;
    }
};


export const zDate = z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    if (arg == undefined) return arg
}, z.date())

// saveActionSchema records each sync action between acuity and coreplus. It is also used to determine the relationship between acuity calendars and Coreplus practitioners, between acuity calendar location and coreplus location, and between acuity appointmentType and Coreplus appointmentType. This is done by fetching an saveActionObject with the acuityCalendarId and seeing if it's already used a coreplus practitionerId, and if not try to link them by name or create a new one in coreplus and log it for future reference.
export const SaveActionSchema = z.object({
    _id: z.string().optional(),
    actionDate: zDate,
    actionType: z.enum(VALID_EVENTS),

    acuityAppointmentTypeName: z.string().or(z.literal('')),//just for the dashboard
    acuityAppointmentStartDate: zDate,

    acuityAppointmentId: z.number(),
    acuityCalendarId: z.number(), // syncs to corePlusPractitionerId (1)
    acuityAppointmentTypeId: z.number(), // syncs to corePlusAppointmentTypeId (2)
    acuityLocationName: z.string().or(z.literal('')), // it's just a string in acuity, syncs to corePlusLocationId (3) below
    acuityClientFullName: z.string().or(z.literal('')), // it's just a string in acuity, syncs to corePlusClientId (4) below

    corePlusAppointmentId: z.string().optional(),
    corePlusPractitionerId: z.string().optional(), // (1)
    corePlusAppointmentTypeId: z.string().optional(), // (2)
    corePlusLocationId: z.string().optional(), // (3)
    corePlusClientId: z.string().optional(), // (4)


    retried: z.boolean().default(false),
    status: z.enum(['Success', 'Failure', 'Processing']),
    errorMessage: z.string().optional()
})


export const getSaveActionModel = (mong?: typeof mongoose) => {
    const mgse = mong ?? mongoose;

    if (mgse.models.SaveAction) return mgse.models.SaveAction as Model<SaveActionObject & Document>

    const saveActionSchema = convertToModel(SaveActionSchema)

    return mgse.model<SaveActionObject & Document>('SaveAction', saveActionSchema, 'saveActions')
}


export function convertToModel<T extends ZodTypeAny>(zodSchema: T, collection?: string,) {
    const jsonSchema = zodToJsonSchema(zodSchema, { name: "Schema", $refStrategy: 'none', },);

    const mongooseSchema = createMongooseSchema({}, {
        ...(jsonSchema.definitions as any).Schema,
        '$schema': 'http://json-schema.org/draft-04/schema#',

    },);

    return new mongoose.Schema(mongooseSchema, { collection });
}


let cached = (global as any).mongoose ?? {}

export async function dbConnect(): Promise<typeof mongoose> {
    if (cached?.conn) {
        return cached.conn
    }

    if (!cached?.promise) {
        console.log('generating mongo instance')

        const connection = await mongoose.connect(process.env.MONGODB_CONNECTION!);
        cached.promise = connection

    }

    cached.conn = await cached.promise

    return cached.conn
}
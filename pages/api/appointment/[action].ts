import { convertAcuityToCorePlus, createWebhook, dbConnect, formJWTCorePlus, getSaveActionModel, headersAcuity, listWebhooks, url, VALID_EVENTS } from "@/utils/db"
import { SaveActionObject } from "@/utils/types"
import { NextApiRequest } from "next"
import { v4 } from 'uuid'


export default async function handler(req: NextApiRequest, res: any) {


    const db = await dbConnect()
    const SaveActionModel = getSaveActionModel(db)


    if (typeof req.body == 'string') req.body = JSON.parse(req.body)

    console.log(`webhook endpoint`, req.body, typeof req.body, req.method)
    if (req.method == "POST") {

        const alreadyProcessing = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: req.body.action, status: 'Processing' } as SaveActionObject).limit(1)

        if (alreadyProcessing?.[0]) return res.status(409).send("Processing")

        switch (req.body.action as typeof VALID_EVENTS[number]) {
            case "appointment.scheduled": {
                //add
                console.log('got here')
                const options = { method: 'GET', headers: headersAcuity };

                const alreadyInserted = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: 'appointment.scheduled' }).limit(1)
                if (!alreadyInserted?.[0] || req.body.retry == true) {

                    //gets the saved appointment
                    const resEvent = await fetch(`https://acuityscheduling.com/api/v1/appointments/${req.body.id}`, options)

                    const jsonEvent = await resEvent.json()
                    console.log("🚀 ~ handler ~ jsonEvent:", jsonEvent)

                    //insert one to see it's loading
                    const loadingActionModel = new SaveActionModel({
                        _id: v4(),
                        acuityCalendarId: jsonEvent.calendarID,
                        acuityAppointmentId: jsonEvent.id,
                        acuityAppointmentTypeName: jsonEvent.type,
                        acuityAppointmentStartDate: convertAcuityToCorePlus(jsonEvent.datetime),
                        acuityAppointmentTypeId: jsonEvent.appointmentTypeID,
                        acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`,
                        acuityLocationName: jsonEvent.location,

                        actionDate: new Date(),
                        actionType: 'appointment.scheduled',
                        status: 'Processing',

                        retried: req.body.retry
                    })

                    await loadingActionModel.save()


                    let corePlusAppointmentTypeId, corePlusPractitionerId, corePlusLocationId, corePlusClientId

                    let noLocation = false;
                    let noPractitioner = false;
                    let errorThrown: string | undefined

                    //TODO: check app type is not inserted already

                    const calendarSaveActionModel = await SaveActionModel.find({ acuityCalendarId: jsonEvent.calendarID, corePlusPractitionerId: { $ne: null } }).limit(1)
                    const appointmentTypeIdSaveActionModel = await SaveActionModel.find({ acuityAppointmentTypeId: jsonEvent.appointmentTypeID, corePlusAppointmentTypeId: { $ne: null } }).limit(1)
                    const locationSaveActionModel = await SaveActionModel.find({ acuityLocationName: jsonEvent.location, corePlusLocationId: { $ne: null } }).limit(1)
                    const clientSaveActionModel = await SaveActionModel.find({ acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`, corePlusClientId: { $ne: null } }).limit(1)
                    //location first since it's the simplest, then practitioner then app type
                    // you can't create practitioners from the api


                    //LOCATION WORK
                    try {
                        if (!locationSaveActionModel?.[0]) {

                            const locationsUrl = 'https://sandbox.coreplus.com.au/API/Core/v2.1/location/'
                            const locationsResult = await fetch(locationsUrl, {
                                headers: {
                                    'Authorization': 'JwToken ' + formJWTCorePlus({ method: "GET", endPoint: locationsUrl }),
                                    'content-type': 'application/json'
                                },
                                method: 'GET'
                            })

                            const { locations } = await locationsResult.json()

                            const foundLocation = locations.find((i: any) => (jsonEvent.location as string).trim() == (i.name as string).trim())

                            if (foundLocation) {
                                console.log("Found Location in Coreplus with the same name")
                                corePlusLocationId = foundLocation.locationId
                                // the sync was made and it's gonna persist forever
                            } else {
                                console.log("Not Found Location with the same name in Coreplus, marking it as an error")
                                noLocation = true
                            }


                        } else corePlusLocationId = locationSaveActionModel[0].corePlusLocationId
                    } catch (error) {
                        console.log(`error in finding the Location ${error}`)
                        errorThrown = `${error}`
                    }

                    //PRACTITIONER WORK
                    try {
                        if (!calendarSaveActionModel?.[0]) {

                            const practitionerUrl = 'https://sandbox.coreplus.com.au/API/Core/v2.1/practitioner/'
                            const practitionerResult = await fetch(practitionerUrl, {
                                headers: {
                                    'Authorization': 'JwToken ' + formJWTCorePlus({ method: "GET", endPoint: practitionerUrl }),
                                    'content-type': 'application/json'
                                },
                                method: 'GET'
                            })

                            const { practitioners } = await practitionerResult.json()

                            const foundPractitioner = practitioners.find((i: any) => (jsonEvent.calendar as string).trim() == (`${i.firstName} ${i.lastName}`).trim())

                            if (foundPractitioner) {
                                console.log("Found Practitioner in Coreplus with the same name")
                                corePlusPractitionerId = foundPractitioner.practitionerId
                                console.log("🚀 ~ handler ~ corePlusPractitionerId:", corePlusPractitionerId)
                                // the sync was made and it's gonna persist forever
                            } else {
                                console.log("Not Found Practitioner with the same name in Coreplus, marking it as an error")
                                noPractitioner = true
                            }


                        } else corePlusPractitionerId = calendarSaveActionModel[0].corePlusPractitionerId
                    } catch (error) {
                        console.log(`error in finding the appointment type ${error}`)
                        errorThrown = `${error}`
                    }

                    //only continue if there are no errors, else a block below will log all the problems in a SaveActionObject
                    if (!noLocation && !noPractitioner && !errorThrown) {
                        console.log('No errors thrown until now, proceeding to finding/creating the client and the appointment type')
                        //CLIENT WORK
                        try {
                            if (!clientSaveActionModel?.[0]) {

                                const clientUrl = 'https://sandbox.coreplus.com.au/API/Core/v2.1/client/'
                                const clientResult = await fetch(clientUrl, {
                                    headers: {
                                        'Authorization': 'JwToken ' + formJWTCorePlus({ method: "GET", endPoint: clientUrl }),
                                        'content-type': 'application/json'
                                    },
                                    method: 'GET'
                                })

                                const { clients } = await clientResult.json()

                                const foundClient = clients.find((i: any) => (jsonEvent.firstName as string).trim() == (i.firstName as string).trim() && (jsonEvent.lastName as string).trim() == (i.lastName as string).trim())

                                if (foundClient) {
                                    console.log("Found Client in Coreplus with the same name")
                                    corePlusClientId = foundClient.clientId
                                    // the sync was made and it's gonna persist forever
                                } else {
                                    console.log("Not Found Client in Coreplus with the same name, creating one")
                                    const responseCreateClientCP = await fetch(clientUrl, {
                                        method: "POST", headers: { 'Authorization': 'JwToken ' + formJWTCorePlus({ method: "POST", endPoint: clientUrl }), 'content-type': 'application/json' },
                                        body: JSON.stringify({
                                            "firstName": jsonEvent.firstName,
                                            "lastName": jsonEvent.lastName,
                                            "dateOfBirth": "2000-01-01",
                                            email: jsonEvent.email,
                                            phoneNumberHome: jsonEvent.phone
                                        })
                                    });

                                    const jsonCreateCalendarCP = await responseCreateClientCP.json()
                                    console.log("🚀 ~ handler ~ jsonCreateAppointmentTypeCP:", jsonCreateCalendarCP)
                                    corePlusClientId = jsonCreateCalendarCP.client.clientId
                                }


                            } else corePlusClientId = clientSaveActionModel[0].corePlusClientId
                        } catch (error) {
                            console.log(`error in finding the Client ${error}`)
                            errorThrown = `${error}`
                        }

                        //APPT TYPE WORK: if no previous appointmentType match found, search one with the same name in coreplus as acuity, and if all fails, create a new one
                        try {
                            if (!appointmentTypeIdSaveActionModel?.[0]) {
                                const appointmentTypeUrl = 'https://sandbox.coreplus.com.au/API/Core/v2.1/appointmenttype/'
                                const appointmentTypesResult = await fetch(appointmentTypeUrl, {
                                    headers: {
                                        'Authorization': 'JwToken ' + formJWTCorePlus({ method: "GET", endPoint: appointmentTypeUrl }),
                                        'content-type': 'application/json'
                                    },
                                    method: 'GET'
                                })

                                const { appointmentTypes } = await appointmentTypesResult.json()

                                const foundAppointmentType = appointmentTypes.find((i: any) => (jsonEvent.type as string).trim() == (i.description as string).trim())

                                if (foundAppointmentType) {
                                    console.log("Found Appointment Type in Coreplus with the same name")
                                    corePlusAppointmentTypeId = foundAppointmentType.appointmentTypeId
                                    // the sync was made and it's gonna persist forever
                                }

                                if (!foundAppointmentType) {
                                    console.log("Not Found Appointment Type with the same name in Coreplus, creating a new one")

                                    const resAcuityAppointmentType = await fetch(`https://acuityscheduling.com/api/v1/appointment-types`, options)
                                    const jsonAcuityAppointmentType = await resAcuityAppointmentType.json()
                                    console.log("🚀 ~ handler ~ jsonAcuityAppointmentType:", jsonAcuityAppointmentType)

                                    if (Array.isArray(jsonAcuityAppointmentType)/*should always return true, unless big error*/) {
                                        const appointmentTypeAcuityJson = jsonAcuityAppointmentType.find((i: any) => i.id == jsonEvent.appointmentTypeID) // should always found object, searches for the appointment in the list
                                        console.log("🚀 ~ handler ~ appointmentTypeAcuityJson:", appointmentTypeAcuityJson)

                                        //found the accuity type, now create it in the coreplus and save the association
                                        const responseCreateAppointmentTypeCP = await fetch(appointmentTypeUrl, {
                                            method: "POST", headers: { 'Authorization': 'JwToken ' + formJWTCorePlus({ method: "POST", endPoint: appointmentTypeUrl }), 'content-type': 'application/json' },
                                            body: JSON.stringify({
                                                "description": appointmentTypeAcuityJson.name,
                                                "durationMinutes": appointmentTypeAcuityJson.duration,
                                                "blockColour": "#FF0000",
                                                // will have to fill in with practitioner and calendar id
                                                "practitionerId": "3dc6e75d-20b6-42bf-bb72-193ce9da85fc",
                                                "locationId": "13f5b125-1b06-4dcc-9bee-23a6de86369c",
                                                // "clientGroupId": "6af5f392-827c-49c4-9c12-9264e848fc18" // might get away without this
                                            })
                                        });

                                        const jsonCreateAppointmentTypeCP = await responseCreateAppointmentTypeCP.json()
                                        console.log("🚀 ~ handler ~ jsonCreateAppointmentTypeCP:", jsonCreateAppointmentTypeCP)

                                        corePlusAppointmentTypeId = jsonCreateAppointmentTypeCP.appointmentTypeId

                                    } else errorThrown = 'Something occured'

                                }

                            } else corePlusAppointmentTypeId = appointmentTypeIdSaveActionModel?.[0].corePlusAppointmentTypeId //beware of edgecase: if he deletes it from coreplus but not from acuity, the sync will not happen
                        } catch (error) {
                            console.log(`error in finding the appointment type ${error}`)
                            errorThrown = `${error}`
                        }
                    }


                    if (noLocation || noPractitioner || errorThrown) {
                        const throwErrorResult = await throwSaveError({ errorThrown, jsonEvent, noLocation, noPractitioner, retried: req.body.retry == true, actionType: 'appointment.scheduled', processingAction: loadingActionModel });

                        return res.status(409).json({ success: false, message: throwErrorResult })
                    } else {
                        //no errors, create the event
                        const method = 'POST'
                        const endPoint = 'https://sandbox.coreplus.com.au/API/Core/v2.1/appointment/'

                        const responseAppointmentAdd = await fetch(endPoint, {
                            method, headers: { 'Authorization': 'JwToken ' + formJWTCorePlus({ method, endPoint }), 'content-type': 'application/json' },
                            body: JSON.stringify({
                                "startDateTime": convertAcuityToCorePlus(jsonEvent.datetime),
                                "endDateTime": convertAcuityToCorePlus(jsonEvent.datetime, { interval: 'minutes', num: jsonEvent.duration }),
                                "practitioner": {
                                    "practitionerId": corePlusPractitionerId
                                },
                                "locationId": corePlusLocationId, // from the calendar.location
                                "appointmentTypeId": corePlusAppointmentTypeId,
                                "notes": `Price: ${jsonEvent.price} • Paid: ${jsonEvent.paid} \nDate Created: ${jsonEvent.dateCreated} \nNotes: ${jsonEvent.notes}`,
                                "notifyPractitioner": "true",
                                "appointmentReminder": {
                                    "isEmailReminderRequired": "false",
                                    "isSmsReminderRequired": "true"
                                },
                                "clients": [
                                    {
                                        "clientId": corePlusClientId
                                    }
                                ]
                            })
                        });

                        const jsonAppointmentAdd = await responseAppointmentAdd.json();
                        console.log("🚀 ~ handler ~ jsonAppointmentAdd:", jsonAppointmentAdd)
                        // can be {  result: [ { severity: 2, reason: 'The selected time is not available for booking an appointment'   }   ]  }

                        if (jsonAppointmentAdd?.result?.[0]?.reason) {
                            errorThrown = jsonAppointmentAdd?.result?.[0]?.reason;
                            const resThrowError = await throwSaveError({ errorThrown, jsonEvent, noLocation, noPractitioner, retried: req.body.retry == true, actionType: 'appointment.scheduled', processingAction: loadingActionModel });

                            return res.status(409).json({ success: false, message: resThrowError })
                        } else if (jsonAppointmentAdd.appointment) {

                            const saveAction = {
                                acuityCalendarId: jsonEvent.calendarID,
                                acuityAppointmentId: jsonEvent.id,
                                acuityAppointmentStartDate: convertAcuityToCorePlus(jsonEvent.datetime),
                                acuityAppointmentTypeName: jsonEvent.type,
                                acuityAppointmentTypeId: jsonEvent.appointmentTypeID,
                                acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`,
                                acuityLocationName: jsonEvent.location,

                                corePlusAppointmentTypeId: corePlusAppointmentTypeId,
                                corePlusClientId: corePlusClientId,
                                corePlusAppointmentId: jsonAppointmentAdd.appointment.appointmentId,
                                corePlusLocationId: corePlusLocationId,
                                corePlusPractitionerId: corePlusPractitionerId,

                                actionDate: new Date(),
                                actionType: 'appointment.scheduled',
                                status: 'Success',
                                retried: req.body.retry == true
                            } as SaveActionObject

                            const updatedAction = await SaveActionModel.updateOne({ _id: loadingActionModel._id }, saveAction)

                            console.log("🚀 ~ handler ~ updatedAction:", updatedAction)

                            return res.status(200).json({ success: true, result: updatedAction })
                        }




                    }

                } else return res.status(409).json({ success: false, message: "Already Inserted" })


                break;
            }
            case "appointment.canceled": {
                const scheduledActionModel = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: 'appointment.scheduled' }).limit(1)

                const canceledActionModel = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: 'appointment.canceled', status: 'Success' }).limit(1)

                console.log(!canceledActionModel?.[0], req.body.retry == true, scheduledActionModel?.[0].corePlusAppointmentId)

                if (canceledActionModel?.[0]) return res.status(200).json({ message: 'Event already deleted' })

                if (scheduledActionModel?.[0].corePlusAppointmentId) {
                    // cancel the event
                    const method = 'POST'
                    const endPoint = `https://sandbox.coreplus.com.au/API/Core/v2.1/appointment/`
                    console.log('got here')
                    const responseAppointmentDelete = await fetch(endPoint, {
                        method, headers: { 'Authorization': 'JwToken ' + formJWTCorePlus({ method, endPoint }), 'content-type': 'application/json' },
                        body: JSON.stringify({
                            "deleted": "true",
                            appointmentId: scheduledActionModel?.[0].corePlusAppointmentId
                        })
                    });
                    console.log('got here 2')
                    console.log("🚀 ~ handler ~ responseAppointmentDelete:", responseAppointmentDelete)

                    const rawPrevSaveObject = JSON.parse(JSON.stringify(scheduledActionModel[0]));

                    const saveAction = new SaveActionModel({
                        ...rawPrevSaveObject,

                        _id: v4(),
                        actionDate: new Date(),
                        actionType: 'appointment.canceled',
                        status: responseAppointmentDelete.status == 200 ? 'Success' : 'Failure',
                        errorMessage: responseAppointmentDelete?.statusText ?? undefined,
                        retried: req.body.retry == true
                    } as SaveActionObject)

                    await saveAction.save()

                    return res.status(responseAppointmentDelete.status).json({ success: responseAppointmentDelete.status == 200, message: await responseAppointmentDelete.json() })
                } else res.status(409).json({ "message": "Scheduled action event not found" })
                break;
            }
            case "appointment.changed": {

                break;
            }
            case "appointment.rescheduled": {

                const scheduledActionModel = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: 'appointment.scheduled' }).limit(1)

                const reScheduledActionModel = await SaveActionModel.find({ acuityAppointmentId: req.body.id, actionType: 'appointment.rescheduled', status: 'Success' }).limit(1)

                if (reScheduledActionModel?.[0]) return res.status(200).json({ message: 'Event already rescheduled' })

                if (scheduledActionModel?.[0].corePlusAppointmentId) {
                    const options = { method: 'GET', headers: headersAcuity };
                    const resEvent = await fetch(`https://acuityscheduling.com/api/v1/appointments/${req.body.id}`, options)

                    const jsonEvent = await resEvent.json()
                    console.log("🚀 ~ handler ~ jsonEvent:", jsonEvent)

                    //insert one to see it's loading
                    const loadingActionModel = new SaveActionModel({
                        _id: v4(),
                        acuityCalendarId: jsonEvent.calendarID,
                        acuityAppointmentId: jsonEvent.id,
                        acuityAppointmentTypeName: jsonEvent.type,
                        acuityAppointmentStartDate: convertAcuityToCorePlus(jsonEvent.datetime),
                        acuityAppointmentTypeId: jsonEvent.appointmentTypeID,
                        acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`,
                        acuityLocationName: jsonEvent.location,

                        actionDate: new Date(),
                        actionType: 'appointment.scheduled',
                        status: 'Processing',

                        retried: req.body.retry
                    })

                    await loadingActionModel.save()

                    let errorThrown: string | undefined

                    //no errors, update the event
                    const method = 'POST'
                    const endPoint = `https://sandbox.coreplus.com.au/API/Core/v2.1/appointment/${scheduledActionModel?.[0].corePlusAppointmentId}/`

                    const responseAppointmentAdd = await fetch(endPoint, {
                        method, headers: { 'Authorization': 'JwToken ' + formJWTCorePlus({ method, endPoint }), 'content-type': 'application/json' },
                        body: JSON.stringify({
                            "startDateTime": convertAcuityToCorePlus(jsonEvent.datetime),
                            "endDateTime": convertAcuityToCorePlus(jsonEvent.datetime, { interval: 'minutes', num: jsonEvent.duration }),
                            "notes": `Price: ${jsonEvent.price} • Paid: ${jsonEvent.paid} \nDate Created: ${jsonEvent.dateCreated} \nNotes: ${jsonEvent.notes}, Rescheduled`,
                            "notifyPractitioner": "true",

                        })
                    });

                    const jsonAppointmentAdd = await responseAppointmentAdd.json();
                    console.log("🚀 ~ handler ~ jsonAppointmentAdd:", jsonAppointmentAdd)
                    // can be {  result: [ { severity: 2, reason: 'The selected time is not available for booking an appointment'   }   ]  }

                    if (jsonAppointmentAdd?.result?.[0]?.reason) {
                        errorThrown = jsonAppointmentAdd?.result?.[0]?.reason;
                        const resThrowError = await throwSaveError({ errorThrown, jsonEvent, noLocation: false, noPractitioner: false, retried: req.body.retry == true, actionType: 'appointment.rescheduled', processingAction: loadingActionModel });

                        return res.status(409).json({ success: false, message: resThrowError })
                    } else if (jsonAppointmentAdd.appointment) {
                        const saveAction = {
                            acuityCalendarId: jsonEvent.calendarID,
                            acuityAppointmentId: jsonEvent.id,
                            acuityAppointmentStartDate: convertAcuityToCorePlus(jsonEvent.datetime),
                            acuityAppointmentTypeName: jsonEvent.type,
                            acuityAppointmentTypeId: jsonEvent.appointmentTypeID,
                            acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`,
                            acuityLocationName: jsonEvent.location,

                            corePlusAppointmentTypeId: scheduledActionModel[0].corePlusAppointmentTypeId,
                            corePlusClientId: scheduledActionModel[0].corePlusClientId,
                            corePlusAppointmentId: scheduledActionModel[0].corePlusAppointmentId,
                            corePlusLocationId: scheduledActionModel[0].corePlusLocationId,
                            corePlusPractitionerId: scheduledActionModel[0].corePlusPractitionerId,

                            actionType: 'appointment.rescheduled',
                            status: 'Success',
                            retried: req.body.retry == true
                        } as SaveActionObject

                        const updateAction = await SaveActionModel.updateOne({ _id: loadingActionModel._id }, saveAction)

                        console.log("🚀 ~ handler ~ updateAction:", updateAction)

                        return res.status(200).json({ success: true, result: updateAction })
                    }
                }

                break;
            }
        }

    }

    if (req.method == "GET") {
        const webhooks = await listWebhooks()

        return res.json(webhooks)
    }
}


async function throwSaveError(
    { errorThrown, jsonEvent, noLocation, noPractitioner, retried, actionType, processingAction }:
        { jsonEvent: any, errorThrown: string | undefined, noLocation: boolean, noPractitioner: boolean, retried: boolean, actionType: string, processingAction: SaveActionObject }
) {

    const db = await dbConnect()
    const SaveActionModel = getSaveActionModel(db)

    const errMessage = `${noLocation ? `No location found with name '${jsonEvent.location}', please create one. ` : ''}${noPractitioner ? `No Practitioner found with name '${jsonEvent.calendar}', please create one. ` : ''}${errorThrown ? `Error thrown ${errorThrown}` : ''}`

    const alreadyInserted = await SaveActionModel.find({ acuityAppointmentId: jsonEvent.id }).limit(1)
    if (!alreadyInserted?.[0] || retried) {
        const errorActionObject = {
            acuityCalendarId: jsonEvent.calendarID,
            acuityAppointmentId: jsonEvent.id,
            acuityAppointmentTypeName: jsonEvent.type,
            acuityAppointmentStartDate: convertAcuityToCorePlus(jsonEvent.datetime),
            acuityAppointmentTypeId: jsonEvent.appointmentTypeID,
            acuityClientFullName: `${jsonEvent.firstName} ${jsonEvent.lastName}`,
            acuityLocationName: jsonEvent.location,

            actionType,
            status: 'Failure',

            errorMessage: errMessage,
            retried

        } as SaveActionObject
        console.log("🚀 ~ handler ~ errorActionObject:", errorActionObject)

        const updatedAction = await SaveActionModel.updateOne({ _id: processingAction._id }, errorActionObject)

        console.log("🚀 ~ updatedAction:", updatedAction)

    }

    return errMessage;
}
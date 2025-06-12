import Image from "next/image";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { dbConnect, getSaveActionModel, listWebhooks } from "@/utils/db";
import { format } from "date-fns";
import { useRouter } from "next/router";
import Spinner from "react-spinner-material"
import { useRef, useState } from "react";

export default function Applied({ saveActions, webhooks }: InferGetServerSidePropsType<typeof getServerSideProps>) {

    const router = useRouter()

    return <div className="container mx-auto">
        {/* <h1>Trusted hearing clinic</h1> */}
        <div className="bg-gray-50 w-full flex flex-row items-center space-x-2">
            <img src="/logo.png" alt="Trusted hc loco" className="w-60" />
            <h2 className="text-lg font-bold">DASHBOARD</h2>
        </div>

        <h2 className="text-2xl">Last Syncs</h2>

        {saveActions.map(i => <div className="flex flex-col max-w-2xl bg-gray-50 p-3 rounded my-2">
            <div className=" flex flex-row justify-between items-center">
                <div key={i._id} className="">
                    <p className="font-bold text-lg">{i.acuityAppointmentTypeName} <span className="bg-blue-100 rounded-full text-sm p-1">{i.actionType.split('.')[1]}</span></p>
                    <p>Submitted on: {format(i.actionDate, "yyyy-MM-dd HH:mm")}</p>
                    {i.acuityAppointmentStartDate && <p>For: {format(i.acuityAppointmentStartDate, "yyyy-MM-dd HH:mm")}</p>}
                    {<p>Client: {i.acuityClientFullName}</p>}
                </div>
                <div className="flex flex-col items-end">
                    <p className={`${i.status == 'Success' ? "text-green-400" : 'text-red-400'}`}>{i.status}</p>
                    <p>Appt. Id: {i.acuityAppointmentId}</p>
                    {i.status == 'Failure' && <ReloadButton action={i.actionType} appointmentId={i.acuityAppointmentId} />}
                </div>

            </div>

            {i.status == "Failure" && <div className="mt-2">{i.errorMessage}</div>}
        </div>)}

        <button className="px-4 py-1.5 rounded-full bg-blue-200 cursor-pointer" onClick={() => router.push('/?limit=200')}>See 200 logs</button>

        <h2 className="text-2xl">Available Webhooks</h2>
        {webhooks.map((i: any) => <div key={i._id} className="bg-gray-50 rounded p-3">
            <p>Id: {i.id}</p>
            <p>Event: {i.event} </p>
            <p>Status: {i.status} </p>
            <p>Points To: {i.target} </p>
        </div>)}
    </div>
}

function ReloadButton({ appointmentId, action }: { appointmentId: number, action: string }) {

    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const ref = useRef<any>('blue')

    return <button
        ref={ref}
        className=" px-4 py-1.5 rounded-full bg-blue-200 cursor-pointer"
        onClick={async () => {
            setIsLoading(true)

            const res = await fetch('/api/appointment/scheduled', {
                method: 'POST',
                body: JSON.stringify({ action, id: appointmentId, retry: true }),
                headers: { accept: 'application/json' }
            });
            router.reload()
            setIsLoading(false)
        }}
    >
        {(isLoading) && <Spinner visible={isLoading} className='ml-2' stroke={3} radius={20} color={(typeof window !== 'undefined' && ref.current) ? window.getComputedStyle(ref.current).getPropertyValue('color') : '#fff'} />}
        Retry
    </button>
}

export async function getServerSideProps({ req, res, query, params }: GetServerSidePropsContext) {

    const db = await dbConnect()
    const SaveActionModel = getSaveActionModel()

    const saveActions = await SaveActionModel.find({}).sort({ actionDate: -1 }).limit(query.limit ? Number(query.limit) : 20)

    const webhooks = await listWebhooks()

    return { props: { saveActions: JSON.parse(JSON.stringify(saveActions)) as typeof saveActions, webhooks }, }
}

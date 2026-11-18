import Stopwatch from './stopwatch';
import { getLogAccess } from './log-access';
export const dynamic = 'force-dynamic';
export default async function Home(){
 const access = await getLogAccess();
 return <Stopwatch recoveryOwner={access&&!access.readOnly?access.ownerId:null} readOnly={access?.readOnly ?? false} ownerName={access?.ownerName ?? null}/>;
}

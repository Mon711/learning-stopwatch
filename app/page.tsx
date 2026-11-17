import Stopwatch from './stopwatch';
import { getLogAccess } from './log-access';
export const dynamic = 'force-dynamic';
export default async function Home(){
 const access = await getLogAccess();
 return <Stopwatch readOnly={access?.readOnly ?? false} ownerName={access?.ownerName ?? null}/>;
}

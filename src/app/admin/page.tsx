import { redirect } from 'next/navigation';
import { requirePageOwner } from '../../server/identity/owner-page';

export default async function AdminPage() {
  await requirePageOwner('/admin');
  redirect('/upload');
}

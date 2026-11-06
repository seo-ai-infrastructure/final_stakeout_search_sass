import { redirect } from 'next/navigation';

/** Short link for sales: stakeoutsearch.com/demo */
export default function DemoShortLink() {
  redirect('/demo/demographics');
}

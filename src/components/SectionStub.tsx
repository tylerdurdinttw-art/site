import { Construction } from 'lucide-react';
import PageTopBar from '@/components/PageTopBar';

/** Раздел из сайдбара, который ещё не сделан: шапка на месте, содержимое честно пустое. */
export default function SectionStub({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageTopBar title={title} />
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2.5 px-6 text-center">
        <Construction size={32} className="text-text-dim" />
        <div className="text-[14px] font-semibold">Раздел в разработке</div>
        <p className="max-w-[380px] text-[13px] leading-relaxed text-text-muted">{note}</p>
      </div>
    </>
  );
}

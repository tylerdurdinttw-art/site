import CheckRoom from '@/components/CheckRoom';

/** Страница одной проверки: переписка с игроком и его карточка справа. */
export default function CheckPage({ params }: { params: { id: string } }) {
  return <CheckRoom checkId={params.id} />;
}

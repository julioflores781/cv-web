import { UI } from '@/lib/admin/messages';

export default function PanelLoading() {
  return (
    <p role="status" aria-busy="true">
      {UI.loading}
    </p>
  );
}

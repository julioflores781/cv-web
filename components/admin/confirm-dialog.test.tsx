import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
const original = { showModal: proto.showModal, close: proto.close };
beforeEach(() => {
  // jsdom does not implement the modal dialog; real behaviour is checked in Chrome.
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <ConfirmDialog
        open={open}
        title="Cerrar todas las sesiones"
        description="Se cerrarán las sesiones de todos los dispositivos, incluida esta."
        confirmLabel="Cerrar todas"
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('T279: focuses «Cancelar», Esc cancels and returns the focus to the trigger, and the text describes the consequence', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Cerrar todas las sesiones' });
    expect(dialog).toHaveAccessibleDescription(/de todos los dispositivos/);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});

"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        Abrir modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Vaciar el carrito?"
        description="Se quitarán los 3 productos. Esta acción no se puede deshacer."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Vaciar carrito
            </Button>
          </>
        }
      >
        <p className="text-[15px]">
          Puedes cerrar con Esc, con la X o haciendo clic fuera. El foco vuelve al botón que lo
          abrió.
        </p>
      </Modal>
    </>
  );
}

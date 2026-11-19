import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";
import { CheckoutSteps } from "@/shared/ui/checkout-steps";

import { getCheckoutStep } from "../container";
import { CheckoutDetailsForm } from "./checkout-details-form";

/** Tienda y compra · Datos y facturación (RF-09, RF-10, RF-11). */
export async function CheckoutDetailsScreen() {
  const step = await getCheckoutStep();

  return (
    <>
      <CheckoutSteps current={2} />
      {step.blocker ? (
        <CannotContinue reason={step.blocker} />
      ) : (
        <CheckoutDetailsForm
          cart={step.cart}
          initialValues={step.values}
          freeShippingThreshold={step.freeShippingThreshold}
        />
      )}
    </>
  );
}

function CannotContinue({ reason }: { reason: "empty" | "blocked" }) {
  return (
    <div className="mx-auto my-6 flex max-w-xl flex-col items-center gap-3 rounded-[32px] bg-surface px-6 py-10 text-center">
      <Tito className="w-24" animated />
      <h1 className="text-3xl font-extrabold">
        {reason === "empty" ? "Tu carrito está vacío" : "Hay productos agotados en tu carrito"}
      </h1>
      <p className="text-text-secondary">
        {reason === "empty"
          ? "Agrega productos para completar tus datos y pagar."
          : "Quítalos del carrito para continuar con la compra."}
      </p>
      {reason === "empty" ? (
        <ButtonLink href="/catalogo" size="lg">
          Ir al catálogo
        </ButtonLink>
      ) : (
        <ButtonLink href="/carrito" size="lg">
          Volver al carrito
        </ButtonLink>
      )}
    </div>
  );
}

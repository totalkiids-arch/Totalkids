"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox, TextField } from "@/shared/ui/form";
import { BagPlusIcon, ChildIcon, StarIcon, TruckIcon } from "@/shared/ui/icons";

import { formatClp, isOnSale, levelsLabel } from "../domain/product";
import {
  clampQuantity,
  discountPercent,
  findVariant,
  initialOption,
  lineTotal,
  maxQuantity,
  stockStatus,
  validatePersonalization,
  type ProductDetail,
  type ProductVariant,
} from "../domain/product-detail";
import { ProductGallery } from "./product-gallery";

/**
 * Galería + información y compra de la ficha (RF-03, RF-04). La variante elegida
 * define precio, SKU y stock; una variante agotada no se puede comprar.
 */
export function ProductShowcase({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const [option, setOption] = useState<string | null>(() => initialOption(product));
  const [quantity, setQuantity] = useState(1);
  const [chosenExtras, setChosenExtras] = useState<ReadonlySet<string>>(new Set());
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string | null>(null);
  const textRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const variant = findVariant(product, option) as ProductVariant;
  const stock = stockStatus(variant);
  const purchasable = stock.kind !== "out-of-stock";
  const extras = product.extras.filter((e) => chosenExtras.has(e.id));
  const total = purchasable ? lineTotal(variant, extras, quantity) : null;
  const eyebrow = [product.category, levelsLabel(product.levels)].filter(Boolean).join(" · ");

  function selectOption(next: string | null) {
    setOption(next);
    const nextVariant = findVariant(product, next);
    if (nextVariant) setQuantity((q) => clampQuantity(q, nextVariant) || 1);
    setAdded(null);
  }

  function toggleExtra(id: string, checked: boolean) {
    setChosenExtras((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (!checked) setErrors(({ [id]: _, ...rest }) => rest);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchasable) return;

    const found: Record<string, string> = {};
    for (const extra of extras) {
      const error = validatePersonalization(extra, texts[extra.id] ?? "");
      if (error) found[extra.id] = error;
    }
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      textRefs.current[firstInvalid]?.focus();
      return;
    }

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    // TODO(carrito): enviar { sku, cantidad, extras y textos } al carrito del servidor (RF-05).
    if (submitter?.value === "comprar") {
      router.push("/checkout");
      return;
    }
    const detail = variant.option ? ` (${variant.option})` : "";
    setAdded(`Agregaste ${quantity} × ${product.name}${detail} al carrito.`);
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ProductGallery product={product} />

      <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-4.5">
        {eyebrow ? (
          <p className="text-sm font-extrabold tracking-[1.5px] text-brand-purple uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[34px] leading-[1.05] font-extrabold sm:text-5xl">{product.name}</h1>
        {product.summary ? <p className="text-[17px] text-text-body">{product.summary}</p> : null}

        <PriceBox product={product} variant={variant} />
        <input type="hidden" name="sku" value={variant.sku} />

        {product.optionName && product.variants.length > 1 ? (
          <fieldset className="flex flex-col">
            <legend className="mb-2.5 font-extrabold">{product.optionName}</legend>
            <div className="flex flex-wrap gap-2.5">
              {product.variants.map((v) => {
                const available = v.available > 0;
                return (
                  <label key={v.sku} className="cursor-pointer">
                    <input
                      type="radio"
                      name="opcion"
                      value={v.option ?? ""}
                      checked={option === v.option}
                      onChange={() => selectOption(v.option)}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex min-h-12 items-center rounded-2xl border-2 border-chip-border bg-surface px-5 text-[15px] font-extrabold peer-checked:border-brand-navy peer-checked:bg-brand-navy peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue ${available ? "" : "text-text-secondary line-through peer-checked:text-on-dark"}`}
                    >
                      {v.option}
                      {available ? null : <span className="sr-only"> (agotado)</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {product.extras.length > 0 ? (
          <fieldset className="flex flex-col gap-1 rounded-[20px] border-2 border-dashed border-chip-border px-4.5 pt-1 pb-3.5">
            <legend className="px-1.5 font-extrabold">Hazlo especial</legend>
            {product.extras.map((extra) => {
              const checked = chosenExtras.has(extra.id);
              return (
                <div key={extra.id} className="flex flex-col gap-1">
                  <Checkbox
                    name="extras"
                    value={extra.id}
                    checked={checked}
                    onChange={(e) => toggleExtra(extra.id, e.currentTarget.checked)}
                    label={
                      <>
                        {extra.label}{" "}
                        <span className="text-text-secondary">(+{formatClp(extra.price)})</span>
                      </>
                    }
                  />
                  {checked && extra.personalization ? (
                    <TextField
                      ref={(el) => {
                        textRefs.current[extra.id] = el;
                      }}
                      name={`texto-${extra.id}`}
                      label={extra.personalization.label}
                      hint={`${extra.personalization.hint} (${(texts[extra.id] ?? "").length}/${extra.personalization.maxLength})`}
                      error={errors[extra.id]}
                      required
                      maxLength={extra.personalization.maxLength}
                      autoComplete="off"
                      value={texts[extra.id] ?? ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setTexts((t) => ({ ...t, [extra.id]: value }));
                      }}
                      className="mb-2 ml-7.5"
                    />
                  ) : null}
                </div>
              );
            })}
            <Link href="/servicios" className="text-sm font-extrabold">
              Ver todos los servicios especiales
            </Link>
          </fieldset>
        ) : null}

        {purchasable ? (
          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper
              value={quantity}
              max={maxQuantity(variant)}
              onChange={(q) => {
                setQuantity(q);
                setAdded(null);
              }}
            />
            <Button
              type="submit"
              name="intencion"
              value="agregar"
              size="lg"
              className="min-h-13.5 flex-[1_1_200px]"
            >
              <BagPlusIcon size={22} />
              Agregar al carrito
            </Button>
          </div>
        ) : (
          <p className="rounded-[20px] bg-soft-red px-4 py-3 font-bold text-brand-red-deep">
            {product.variants.length > 1
              ? "Esta opción está agotada. Elige otra."
              : "Producto agotado por ahora. Escríbenos y te avisamos cuando vuelva."}
          </p>
        )}

        {total !== null && quantity > 1 ? (
          <p aria-live="polite" className="text-right font-extrabold">
            Total: <span className="font-heading text-2xl">{formatClp(total)}</span>
          </p>
        ) : null}

        <Button
          type="submit"
          name="intencion"
          value="comprar"
          variant="accent"
          size="lg"
          disabled={!purchasable}
          className="min-h-13.5"
        >
          Comprar ahora
        </Button>

        <div role="status" className="empty:hidden">
          {added ? (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] bg-soft-green px-4 py-3 font-bold">
              {added}
              <Link href="/carrito" className="font-extrabold">
                Ver carrito
              </Link>
            </p>
          ) : null}
        </div>

        <ul className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 text-sm font-bold">
          <li className="flex items-center gap-2.5 rounded-[18px] bg-soft-blue px-3.5 py-3">
            <TruckIcon size={22} className="shrink-0 text-brand-blue" />
            {product.leadTime ? `Fabricación en ${product.leadTime}` : "Despacho [PLAZO]"}
          </li>
          <li className="flex items-center gap-2.5 rounded-[18px] bg-soft-green px-3.5 py-3">
            <StarIcon size={22} className="shrink-0 text-brand-green" />
            Garantía{" "}
            {product.warrantyMonths === null ? "[MESES]" : `${product.warrantyMonths} meses`}
          </li>
          <li className="flex items-center gap-2.5 rounded-[18px] bg-cream px-3.5 py-3">
            <ChildIcon size={22} className="shrink-0 text-yellow-ink" />
            {product.highlight}
          </li>
        </ul>
      </form>
    </div>
  );
}

function PriceBox({ product, variant }: { product: ProductDetail; variant: ProductVariant }) {
  const stock = stockStatus(variant);
  const percent = discountPercent(variant.price, variant.compareAtPrice);
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-surface px-5 py-4 shadow-[0_2px_0_var(--color-border)]">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="sr-only">Precio:</span>
        <strong className="font-heading text-4xl font-extrabold">{formatClp(variant.price)}</strong>
        {isOnSale(product) && variant.compareAtPrice !== null ? (
          <>
            <s className="text-text-secondary">
              <span className="sr-only">Antes: </span>
              {formatClp(variant.compareAtPrice)}
            </s>
            {percent !== null ? (
              <span className="self-center rounded-full bg-soft-red px-2.5 py-1 text-[13px] font-extrabold text-brand-red-deep">
                Ahorras {percent}%
              </span>
            ) : null}
          </>
        ) : null}
      </p>
      <p className="text-sm text-text-secondary">
        Hasta {product.installments ?? "[N]"} cuotas sin interés · SKU {variant.sku}
      </p>
      <p
        aria-live="polite"
        className={`flex items-center gap-2 text-sm font-extrabold ${stock.kind === "in-stock" ? "text-brand-green" : "text-brand-red-deep"}`}
      >
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${stock.kind === "in-stock" ? "bg-brand-green" : "bg-brand-red"}`}
        />
        {stock.kind === "in-stock"
          ? "Disponible"
          : stock.kind === "low"
            ? `¡Quedan solo ${stock.units} ${stock.units === 1 ? "unidad" : "unidades"}!`
            : "Agotado"}
      </p>
    </div>
  );
}

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function QuantityStepper({ value, max, onChange }: QuantityStepperProps) {
  const button =
    "flex size-11 items-center justify-center rounded-full bg-cream text-[22px] font-extrabold hover:bg-soft-yellow disabled:cursor-not-allowed disabled:opacity-45";
  return (
    <div
      role="group"
      aria-label="Cantidad"
      className="flex items-center rounded-full border-2 border-chip-border bg-surface p-1"
    >
      <button
        type="button"
        aria-label="Quitar uno"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className={button}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-10 text-center text-lg font-extrabold">
        {value}
      </output>
      <input type="hidden" name="cantidad" value={value} />
      <button
        type="button"
        aria-label="Agregar uno"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={button}
      >
        +
      </button>
    </div>
  );
}

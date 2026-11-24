import "server-only";

import { generalFormError, postApiForm, FORM_MESSAGES } from "@/shared/infrastructure/api-forms";

import { NewsletterUnavailableError, type NewsletterGateway } from "../application/ports";

/** Adaptador: newsletter en la API (POST /newsletter y la baja en dos pasos). */
export const apiNewsletterGateway: NewsletterGateway = {
  async subscribe(email, consent) {
    const result = await send("/newsletter", {
      email,
      consent: true,
      consentVersion: consent.version,
    });
    if (result.status !== 202) throw new NewsletterUnavailableError(generalFormError(result));
  },

  async requestUnsubscribeLink(email) {
    const result = await send("/newsletter/unsubscribe-link", { email });
    if (result.status !== 202) throw new NewsletterUnavailableError(generalFormError(result));
  },

  async confirmUnsubscribe(token) {
    const result = await send("/newsletter/unsubscribe", { token });
    if (result.status === 204) return true;
    if (result.status === 404 || result.status === 422) return false;
    throw new NewsletterUnavailableError(generalFormError(result));
  },
};

async function send(path: `/${string}`, body: unknown) {
  try {
    return await postApiForm(path, body);
  } catch {
    throw new NewsletterUnavailableError(FORM_MESSAGES.unavailable);
  }
}

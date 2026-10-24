/**
 * How SLICE hands a sign-in code to its address (D5): by Resend when its key is
 * present, otherwise printed in the server's terminal and sent nowhere.
 */
import type { SendCode } from './auth';

/** Resend's sender until SLICE has a domain of its own: it only reaches the Resend account's own address. */
const FROM = 'SLICE <onboarding@resend.dev>';

export function codeSenderFromEnv(env: NodeJS.ProcessEnv): SendCode {
  return env.RESEND_API_KEY ? emailCodeByResend(env.RESEND_API_KEY) : printCode;
}

/** Resend's API (https://resend.com/docs/api-reference/emails/send-email). */
function emailCodeByResend(apiKey: string): SendCode {
  return async (email, code) => {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: `${code} is your SLICE code`,
        text: `Your SLICE sign-in code: ${code}\n\nIf you didn't ask for it, ignore this email.`,
      }),
    });
  };
}

/** Without Resend: the code is read in the server's terminal. */
const printCode: SendCode = async (email, code) => {
  console.log(`Sign-in code for ${email}: ${code} (no RESEND_API_KEY, no email sent)`);
};

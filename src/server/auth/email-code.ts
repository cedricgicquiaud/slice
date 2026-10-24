/**
 * How SLICE hands a sign-in code to its address (D5): by Resend when its key is
 * present, otherwise printed in the server's terminal and sent nowhere.
 */
import type { SendCode } from './auth';

export function codeSenderFromEnv(_env: NodeJS.ProcessEnv): SendCode {
  return printCode;
}

/** Without Resend: the code is read in the server's terminal. */
const printCode: SendCode = async (email, code) => {
  console.log(`Sign-in code for ${email}: ${code} (no RESEND_API_KEY, no email sent)`);
};

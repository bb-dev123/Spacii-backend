import {
  Configuration,
  PlaidApi,
  Products,
  CountryCode,
  PlaidEnvironments,
} from "plaid";
import { CustomError } from "./error";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_KEY = process.env.PLAID_SECRET_KEY;
const PLAID_ENV = process.env.PLAID_ENV;

if (!PLAID_CLIENT_ID || !PLAID_SECRET_KEY || !PLAID_ENV) {
  throw new CustomError(400, "Missing environment variable");
}

const plaid = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET_KEY,
    },
  },
});

export default plaid;
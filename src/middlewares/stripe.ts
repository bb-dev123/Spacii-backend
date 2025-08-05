import Stripe from "stripe";
import { CustomError } from "./error";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new CustomError(400, "Missing STRIPE_SECRET_KEY environment variable");
}

// Initialize Stripe with a valid API version
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil'
});

export default stripe;
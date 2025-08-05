import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { passport } from "./middlewares/passport";
import routes from "./routes";
import { errorHandler } from "./middlewares/error";
import { PaymentController } from "./controllers/paymentController";
import { cronJobs } from "./helpers/cronJobs";
import payoutRoutes from "./routes/payoutRoutes";
//check
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: envFile });

const app = express();

app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  PaymentController.handleWebhook
);
app.use('/api/stripe-payout/webhook', 
  express.raw({ type: 'application/json' }), 
  payoutRoutes
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const corsOptions = {
  origin: ["http://localhost:3000", "https://spotie-demo.netlify.app", "*"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(passport.initialize());
app.use(cors(corsOptions));

app.use("/api", routes);
app.use(errorHandler);

cronJobs();

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

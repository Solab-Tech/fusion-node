# @usefusion/node

The official Node SDK for the [Fusion](https://usefusion.com) Checkout API.

> **In development.** Not published to npm yet. Progress: [`docs/tasks.md`](docs/tasks.md).

```ts
import Fusion from "@usefusion/node";

const fusion = new Fusion(process.env.FUSION_SECRET_KEY!);

const payment = await fusion.payments.create({
  amountMinor: 500000, // ₦5,000.00, in kobo
  currency: "NGN",
  redirectUrl: "https://shop.example/checkout/return",
});
// send the customer to payment.url
```

## License

[MIT](LICENSE)

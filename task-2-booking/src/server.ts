// @rev kc-31
import { app } from './app.ts';

const port = Number(process.env.PORT ?? 3002);

app.listen(port, () => {
  console.log(`booking: http://localhost:${port}`);
});

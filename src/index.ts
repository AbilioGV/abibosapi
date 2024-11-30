import { Role } from './models/role';
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { decode, jwt, sign } from "hono/jwt";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";
import { number, z } from "zod";
import { db } from "./lib/db";
import { User } from "./models/user";
import { password } from "bun";
import { Order } from "./models/order";
import { Frequency } from "./models/frequency";
import { Company } from "./models/company";

const app = new Hono();

const admin = createMiddleware(async (c, next) => {
  const token = c.req.header("Authorization")?.split(" ")[1] as string

  const { payload } = decode(token)


  const role = db.query(`
SELECT 
r.cd_role,
r.ds_role,
r.cd_status,
r.dt_operacao
FROM 
tb_users u
INNER JOIN
tb_roles r ON u.cd_role = r.cd_role
WHERE
u.cd_user = ?;`
  ).as(Role).get(payload.sub as any)

  if (role?.cd_role !== 1) {
    return c.newResponse(null, 403)
  }

  await next()
})

app.use(cors())

app.post(
  "/login",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z.string(),
    })
  ),
  async (c) => {
    const data = c.req.valid("json");

    const user = db
      .query(`select * from tb_users where ds_email = ?`)
      .as(User)
      .get(data.email);

    if (!user || user?.ds_password !== data.password) {
      return c.newResponse(null, 404);
    }

    const token = await sign(
      {
        sub: user.cd_user,
        role: user.cd_role
      },
      "secret"
    );

    return c.json({
      token,
      name: user.ds_user,
      role: user.cd_role
    });
  }
);

app.post(
  "/register",
  zValidator(
    "json",
    z.object({
      name: z.string(),
      email: z.string().email(),
      password: z.string()
    })
  ),
  async (c) => {
    const data = c.req.valid("json");

    let user = db
      .query(`select * from tb_users where ds_email = ?`)
      .as(User)
      .get(data.email);

    if (user) {
      return c.newResponse(null, 409);
    }

    user = db
      .query(
        `insert into tb_users (
        ds_user, 
        ds_login, 
        ds_password, 
        ds_name,
        ds_surname, 
        ds_email, 
        cd_role, 
        dt_operacao
        ) values (
        ?, ?, ?, ?, ?, ?, ?, ?
        )
        returning * 
        `
      )
      .as(User)
      .get(
        data.name,
        data.email,
        data.password,
        data.name,
        "",
        data.email,
        4,
        new Date().toISOString()
      );

    const token = await sign(
      {
        sub: user?.cd_user,
      },
      "secret"
    );

    return c.json({
      token,
      name: user?.ds_user,
    });
  }
);

/* app.get(
  "user",
  jwt({
    secret: "secret",
  }),
  async (c) => {
    const token = c.req.header("Authorization")?.split(" ")[1] as string

    const { payload } = decode(token)


    const role = db.query(`
SELECT 
r.cd_role,
r.ds_role,
r.cd_status,
r.dt_operacao
FROM 
tb_users u
INNER JOIN
tb_roles r ON u.cd_role = r.cd_role
WHERE
u.cd_user = ?;`
    ).as(Role).get(payload.sub as any)

    return c.json(role)
  }
) */

/* app.post(
  "/empresa",
  zValidator(
    "json",
    z.object({
      empresa: z.string(),
      status: z.enum(["ativo", "em andamento", "finalizado"]),
    })
  ),

  async (c) => {
    const data = c.req.valid("json");

    db.query(
      `INSERT INTO tb_company (
    ds_company,
    cd_status,
    dt_operacao
    ) values (
    ?, ?, ? 
    )
    returning *
    `
    )
      .as(Company)
      .get(data.empresa, data.status, new Date().toISOString());
  }
);

app.post(
  "/frequencia",
  zValidator(
    "json",
    z.object({
      frequencia: z.enum(["Diária", "Semanal", "Mensal"]),
      status: z.enum(["ativo", "em andamento", "finalizado"]),
    })
  ),

  async (c) => {
    const data = c.req.valid("json");

    db.query(
      `INSERT INTO tb_freq (
      ds_freq,
      cd_status,
      dt_operacao
      ) values (
      ?, ?, ?
      ) 
      returning *
      `
    )
      .as(Frequency)
      .get(data.frequencia, data.status, new Date().toISOString());
  }
);
 */
app.post(
  "/pedido",
  jwt({
    secret: "secret",
  }),
  zValidator(
    "json",
    z.object({
      ename: z.string(),
      pname: z.string(),
      desc: z.string(),
      objetivo: z.string(),
      volume: z.string(),
      comentario: z.string(),

      frequencia: z.enum(["Diária", "Semanal", "Mensal"]),
    })
  ),

  async (c) => {
    const data = c.req.valid("json");

    let frequency: Frequency | null = null;
    let company: Company | null = null;
    let order: Order | null = null;

    const transaction = db.transaction(async () => {
      frequency = db
        .query(
          `INSERT INTO tb_freq (
            ds_freq,
            cd_status,
            dt_operacao
            ) values (
            ?, ?, ?
            ) 
            returning *
            `
        )
        .as(Frequency)
        .get(data.frequencia, "ativo", new Date().toISOString());

      company = db
        .query(
          `INSERT INTO tb_company (
            ds_company,
            cd_status,
            dt_operacao
            ) values (
            ?, ?, ?
            )
            returning *
            `
        )
        .as(Company)
        .get(data.ename, "ativo", new Date().toISOString());

      order = db
        .query(
          `INSERT INTO tb_orders (
            ds_title_order,
            ds_order,
            cd_company,
            cd_status_order,
            cd_dev,
            ds_name_process,
            ds_process,
            ds_obj_aut,
            dt_operacao,
            ds_volume_processamento,
            ds_comentarios
            ) values (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            returning *
            `
        )
        .as(Order)
        .get(
          "",
          "",
          company?.cd_company ?? "",
          3,
          "",
          data.pname,
          data.desc,
          data.objetivo,
          new Date().toISOString(),
          data.volume,
          data.comentario,
        );
    });
    transaction();
    return c.json({
      frequency,
      company,
      order,
    });
  }
);

app.get(
  "/dashboard",
  jwt({
    secret: "secret",
  }), 
  admin,
  async (c) => {
    const orders = db
      .query(
        `SELECT * FROM tb_orders 
         JOIN tb_company ON tb_orders.cd_company = tb_company.cd_company
         WHERE tb_orders.cd_status_order = 3
         `
      )
      .all();

    return c.json(orders);
  }
);

export default app;

import nodemailer from 'nodemailer';
import type { Config } from '../config';

/**
 * Fournisseur d'envoi actif.
 *
 * - `resend` / `brevo` : API HTTPS — offres gratuites, et surtout aucun port
 *   SMTP sortant à ouvrir (beaucoup d'hébergeurs bloquent 25/465/587, cause la
 *   plus fréquente d'e-mails qui ne partent jamais).
 * - `smtp` : n'importe quel serveur SMTP (messagerie du domaine, Gmail + mot de
 *   passe d'application, relais Brevo…).
 * - `console` : le lien est écrit dans les journaux du serveur au lieu d'être
 *   envoyé. Développement local, ou dépannage sur un serveur.
 * - `none` : comptes e-mail désactivés, le reste du jeu fonctionne.
 */
export type MailProvider = 'resend' | 'brevo' | 'smtp' | 'console' | 'none';

export interface Mailer {
  enabled: boolean;
  provider: MailProvider;
  sendMagicLink: (email: string, url: string) => Promise<void>;
}

/** Au-delà, le fournisseur est considéré injoignable plutôt que d'attendre. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Expéditeur bac à sable de Resend : n'exige aucun domaine vérifié, mais
 * n'accepte comme destinataire que l'adresse du titulaire du compte. Suffisant
 * pour valider une installation, pas pour ouvrir le jeu à des joueurs.
 */
const RESEND_SANDBOX_FROM = 'ZapZap <onboarding@resend.dev>';

interface Message {
  subject: string;
  text: string;
  html: string;
}

function magicLinkMessage(url: string): Message {
  return {
    subject: 'Ton lien de connexion ZapZap ⚡',
    text: `Bonjour !\n\nClique sur ce lien pour confirmer ton compte ZapZap :\n${url}\n\nCe lien expire dans 15 minutes. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.`,
    html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1c1547">ZapZap ⚡</h2>
            <p>Clique sur le bouton pour confirmer ton compte&nbsp;:</p>
            <p style="text-align:center;margin:24px 0">
              <a href="${url}" style="background:#ffd34d;color:#110c2e;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold">
                Confirmer mon compte
              </a>
            </p>
            <p style="color:#666;font-size:13px">Ce lien expire dans 15 minutes. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
          </div>`,
  };
}

/** « ZapZap <no-reply@exemple.fr> » → { name: 'ZapZap', email: 'no-reply@…' } */
export function parseAddress(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  const name = match[1].replace(/^"|"$/g, '').trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * Choisit le fournisseur d'après la configuration présente.
 *
 * `MAIL_PROVIDER` prime : sans lui, la première clé trouvée gagne, ce qui
 * permet d'activer l'envoi en ajoutant une seule variable d'environnement.
 */
export function detectProvider(config: Config): MailProvider {
  if (config.mailProvider) return config.mailProvider;
  if (config.resendApiKey) return 'resend';
  if (config.brevoApiKey) return 'brevo';
  if (config.smtpHost && config.smtpUser && config.smtpPass) return 'smtp';
  // En développement, on n'exige aucun compte : le lien s'affiche dans le
  // terminal du serveur, il suffit de le coller dans le navigateur.
  return config.isProduction ? 'none' : 'console';
}

/** Expéditeur commun à tous les fournisseurs, avec repli sur le SMTP. */
function resolveFrom(config: Config): string | undefined {
  return config.mailFrom ?? config.smtpFrom ?? config.smtpUser;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Le corps de la réponse porte le motif exact (domaine non vérifié, quota
    // atteint, clé invalide…) : sans lui, le diagnostic est impossible.
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${detail.slice(0, 300)}`);
  }
}

function disabled(reason: string): Mailer {
  console.warn(`[mail] envoi désactivé — ${reason}`);
  return {
    enabled: false,
    provider: 'none',
    sendMagicLink: async () => {
      throw new Error('Envoi d’e-mails non configuré');
    },
  };
}

export function createMailer(config: Config): Mailer {
  const provider = detectProvider(config);
  const from = resolveFrom(config);

  switch (provider) {
    case 'resend': {
      if (!config.resendApiKey) {
        return disabled('MAIL_PROVIDER=resend mais RESEND_API_KEY est absente');
      }
      // Sans domaine vérifié chez Resend, seul l'expéditeur bac à sable passe.
      const sender = from ?? RESEND_SANDBOX_FROM;
      if (!from) {
        console.warn(
          `[mail] MAIL_FROM absent — expéditeur ${RESEND_SANDBOX_FROM} : Resend ne livrera qu'à l'adresse du titulaire du compte`,
        );
      }
      console.log(`[mail] fournisseur : Resend (API HTTPS), expéditeur ${sender}`);
      return {
        enabled: true,
        provider,
        sendMagicLink: async (email, url) => {
          const msg = magicLinkMessage(url);
          await postJson(
            'https://api.resend.com/emails',
            { Authorization: `Bearer ${config.resendApiKey}` },
            { from: sender, to: [email], subject: msg.subject, text: msg.text, html: msg.html },
          );
        },
      };
    }

    case 'brevo': {
      if (!config.brevoApiKey) {
        return disabled('MAIL_PROVIDER=brevo mais BREVO_API_KEY est absente');
      }
      if (!from) {
        return disabled('MAIL_FROM est requis avec Brevo (adresse d’expéditeur validée dans le compte)');
      }
      const sender = parseAddress(from);
      console.log(`[mail] fournisseur : Brevo (API HTTPS), expéditeur ${from}`);
      return {
        enabled: true,
        provider,
        sendMagicLink: async (email, url) => {
          const msg = magicLinkMessage(url);
          await postJson(
            'https://api.brevo.com/v3/smtp/email',
            { 'api-key': config.brevoApiKey! },
            { sender, to: [{ email }], subject: msg.subject, textContent: msg.text, htmlContent: msg.html },
          );
        },
      };
    }

    case 'smtp': {
      if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        return disabled('SMTP_HOST, SMTP_USER et SMTP_PASS doivent être renseignés ensemble');
      }
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPass },
      });
      const sender = from ?? config.smtpUser;
      console.log(`[mail] fournisseur : SMTP ${config.smtpHost}:${config.smtpPort}, expéditeur ${sender}`);
      return {
        enabled: true,
        provider,
        sendMagicLink: async (email, url) => {
          const msg = magicLinkMessage(url);
          await transport.sendMail({ from: sender, to: email, ...msg });
        },
      };
    }

    case 'console': {
      console.log('[mail] fournisseur : console — les liens magiques sont écrits dans ces journaux, jamais envoyés');
      return {
        enabled: true,
        provider,
        sendMagicLink: async (email, url) => {
          console.log(`\n[mail] lien magique pour ${email} :\n  ${url}\n`);
        },
      };
    }

    default:
      return disabled(
        'aucun fournisseur configuré (RESEND_API_KEY, BREVO_API_KEY ou SMTP_*) — voir deploy/DEPLOY.md',
      );
  }
}

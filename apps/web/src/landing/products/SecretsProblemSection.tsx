import { HugeiconsIcon } from "@hugeicons/react";
import File01Icon from "@outray/icons/stroke/File01Icon";
import styles from "./SecretsProblemSection.module.css";

const conversation = [
  { name: "Amara Okafor", avatar: "/landing/secrets/avatars/amara.svg", side: "sent", time: "22:24", label: "10:24 PM", message: "Anyone got the latest production Stripe key? Mine stopped working after the rotation." },
  { name: "Tobi Oladele", avatar: "/landing/secrets/avatars/tobi.svg", side: "received", time: "22:25", label: "10:25 PM", message: "This one? Delete it when you’re done.", attachment: true },
  { name: "Nneka Eze", avatar: "/landing/secrets/avatars/nneka.svg", side: "received", time: "22:26", label: "10:26 PM", message: "Wait. Is that production or staging?", reaction: true },
  { name: "Amara Okafor", avatar: "/landing/secrets/avatars/amara.svg", side: "sent", time: "22:27", label: "10:27 PM", message: "My .env has a different value…" },
] as const;

export function SecretsProblemSection() {
  return <section className={styles.section} aria-labelledby="secrets-problem-title">
    <div className={styles.copy}><h2 id="secrets-problem-title">Stop passing <span>.env</span> files around.</h2><p>One quick ask turns into a credential in a group chat. Now nobody knows which version is current.</p></div>
    <div className={styles.chat}>
      <ol className={styles.messages} aria-label="Team chat about environment secrets">
        {conversation.map((message) => <li className={styles.message} data-side={message.side} key={message.time}>
          <img className={styles.avatar} src={message.avatar} alt="" width={44} height={44} loading="lazy" decoding="async" />
          <div className={styles.messageBody}>
            <div className={styles.messageHeading}><span>{message.name}</span><time dateTime={message.time}>{message.label}</time></div>
            <div className={styles.bubble}>
              <p>{message.message}{"reaction" in message ? <span className={styles.reaction} aria-label="3 people reacted with eyes"><span aria-hidden="true">👀</span> 3</span> : null}</p>
              {"attachment" in message ? <div className={styles.attachment}><div className={styles.attachmentHeading}><span><HugeiconsIcon icon={File01Icon} size={14} strokeWidth={1.5} aria-hidden="true" />production.env</span><span>pasted</span></div><code>STRIPE_SECRET_KEY=sk_live_••••••••</code></div> : null}
            </div>
          </div>
        </li>)}
      </ol>
    </div>
  </section>;
}

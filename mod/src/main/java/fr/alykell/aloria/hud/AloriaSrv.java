package fr.alykell.aloria.hud;

import java.util.Hashtable;
import java.util.Locale;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;

/**
 * Adresses <nom>.aloriamc.fr (serveurs de la page Serveurs reliés à playit) : l'enregistrement SRV qui mène au tunnel est
 * créé au démarrage du serveur. Les DNS du joueur (box, AdGuard…) gardent jusqu'à 30 min une réponse « n'existe pas »
 * obtenue avant (serveur éteint, première tentative trop tôt) : le jeu ne trouvait alors pas le serveur. On demande donc
 * le SRV directement à des DNS publics, qui interrogent Cloudflare à chaque fois ; à défaut, le jeu fait comme d'habitude.
 * Java 8 (partagé avec mod-legacy et mod-forge, voir leur build.gradle).
 */
public final class AloriaSrv {
	public static final String DOMAIN = ".aloriamc.fr";
	private static final String SERVERS = "dns://1.1.1.1 dns://8.8.8.8 dns://1.0.0.1";

	private AloriaSrv() {}

	public static boolean handles(String host) {
		return host != null && host.toLowerCase(Locale.ROOT).replaceAll("\\.$", "").endsWith(DOMAIN);
	}

	/** { cible sans point final, port } du SRV _minecraft._tcp.<host>, ou null (pas trouvé, réseau qui bloque ces DNS) */
	public static String[] lookup(String host) {
		if (!handles(host)) return null;
		try {
			Hashtable<String, String> env = new Hashtable<String, String>();
			env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
			env.put("java.naming.provider.url", SERVERS);
			env.put("com.sun.jndi.dns.timeout.initial", "1500");
			env.put("com.sun.jndi.dns.timeout.retries", "1");
			InitialDirContext context = new InitialDirContext(env);
			try {
				String name = "_minecraft._tcp." + host.replaceAll("\\.$", "");
				Attributes attributes = context.getAttributes(name, new String[] {"SRV"});
				Attribute srv = attributes.get("srv");
				if (srv == null) return null;
				// « priorité poids port cible. »
				String[] parts = srv.get().toString().split(" ", 4);
				if (parts.length < 4) return null;
				String target = parts[3].endsWith(".") ? parts[3].substring(0, parts[3].length() - 1) : parts[3];
				return new String[] {target, parts[2]};
			} finally {
				context.close();
			}
		} catch (Throwable e) {
			return null;
		}
	}
}

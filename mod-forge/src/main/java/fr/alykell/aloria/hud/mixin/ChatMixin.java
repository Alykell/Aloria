package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AutoLogin;
import net.minecraft.client.network.NetHandlerPlayClient;
import net.minecraft.network.play.server.S02PacketChat;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Messages du serveur, pour la connexion automatique. RETURN : le premier appel (fil réseau) sort par une exception
 * pour se refaire sur le fil du jeu, seul le second arrive ici.
 */
@Mixin(NetHandlerPlayClient.class)
public class ChatMixin {
	@Inject(method = "handleChat", at = @At("RETURN"))
	private void aloriahud$chat(S02PacketChat packet, CallbackInfo ci) {
		if (packet.getChatComponent() != null) AutoLogin.onMessage(packet.getChatComponent().getUnformattedText());
	}
}

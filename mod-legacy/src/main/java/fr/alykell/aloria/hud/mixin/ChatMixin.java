package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AutoLogin;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.network.packet.s2c.play.ChatMessageS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Messages du serveur, pour la connexion automatique. RETURN : le premier appel (fil réseau) sort par une exception
 * pour se refaire sur le fil du jeu, seul le second arrive ici.
 */
@Mixin(ClientPlayNetworkHandler.class)
public class ChatMixin {
	@Inject(method = "onChatMessage", at = @At("RETURN"))
	private void aloriahud$chat(ChatMessageS2CPacket packet, CallbackInfo ci) {
		if (packet.getMessage() != null) AutoLogin.onMessage(packet.getMessage().asUnformattedString());
	}
}

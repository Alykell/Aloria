package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaSrv;
import net.minecraft.network.ServerAddress;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * <nom>.aloriamc.fr : SRV demandé à des DNS publics (voir AloriaSrv, copié depuis mod/) plutôt qu'à ceux du joueur, qui
 * peuvent garder une réponse « n'existe pas » jusqu'à 30 min. Rien de trouvé : recherche habituelle du jeu.
 * (Même mixin dans mod-forge, en noms MCP.)
 */
@Mixin(ServerAddress.class)
public abstract class AloriaAddressMixin {
	@Inject(method = "resolveSrv", at = @At("HEAD"), cancellable = true)
	private static void aloria$publicSrv(String host, CallbackInfoReturnable<String[]> cir) {
		String[] srv = AloriaSrv.lookup(host);
		if (srv != null) cir.setReturnValue(srv);
	}
}

package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaSrv;
import java.util.Optional;
import net.minecraft.client.multiplayer.resolver.ResolvedServerAddress;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.multiplayer.resolver.ServerAddressResolver;
import net.minecraft.client.multiplayer.resolver.ServerNameResolver;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * <nom>.aloriamc.fr : SRV demandé à des DNS publics (voir AloriaSrv) plutôt qu'à ceux du joueur, qui peuvent garder une
 * réponse « n'existe pas » jusqu'à 30 min. Connexion et ping de la liste des serveurs (tous deux passent par ici, hors
 * du fil de rendu). Rien de trouvé : le jeu cherche comme d'habitude.
 */
@Mixin(ServerNameResolver.class)
public abstract class AloriaAddressMixin {
	@Inject(method = "resolveAddress", at = @At("HEAD"), cancellable = true)
	private void aloria$publicSrv(ServerAddress address, CallbackInfoReturnable<Optional<ResolvedServerAddress>> cir) {
		if (address.getPort() != 25565 || !AloriaSrv.handles(address.getHost())) return;
		String[] srv = AloriaSrv.lookup(address.getHost());
		if (srv == null || !srv[1].matches("\\d{1,5}")) return;
		Optional<ResolvedServerAddress> resolved = ServerAddressResolver.SYSTEM.resolve(new ServerAddress(srv[0], Integer.parseInt(srv[1])));
		if (resolved.isPresent()) cir.setReturnValue(resolved);
	}
}

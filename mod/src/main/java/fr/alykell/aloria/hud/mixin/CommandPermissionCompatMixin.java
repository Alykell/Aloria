package fr.alykell.aloria.hud.mixin;

import net.minecraft.commands.CommandSourceStack;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 12111
import net.minecraft.server.permissions.Permission;
import net.minecraft.server.permissions.PermissionLevel;
//#endif

/**
 * Compatibilité (jeu et serveur) : la 1.21.11 a remplacé hasPermission(int) par un système de permissions, mais e4mc
 * (« Jouer avec des amis », serveurs de la page Serveurs) l'appelle encore pour sa commande /e4mc : le serveur plantait
 * dès qu'un joueur se connectait. On remet la méthode, traduite vers le nouveau système. Avant 1.21.11 : classe vide.
 */
@Mixin(CommandSourceStack.class)
public abstract class CommandPermissionCompatMixin {
	//#if MC >= 12111
	// En 1.21.11 (obfusqué), e4mc appelle la méthode par son nom intermédiaire : la nôtre doit le porter
	//#if MC >= 260000
	public boolean hasPermission(int level) {
	//#else
	//$$ public boolean method_9259(int level) {
	//#endif
		return ((CommandSourceStack) (Object) this).permissions().hasPermission(new Permission.HasCommandLevel(PermissionLevel.byId(level)));
	}
	//#endif
}

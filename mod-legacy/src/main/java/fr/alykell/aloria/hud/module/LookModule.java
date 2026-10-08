package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.mixin.InteractionManagerAccessor;
//#if FORGE
//#else
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
//#endif
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.util.Identifier;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;

import java.util.Locale;

/** Bloc ou créature visé, façon Jade : icône, nom, mod d'origine et une info utile (récolte, minage, vie). */
public final class LookModule extends HudModule {
	private static final class Target {
		final ItemStack icon;
		final String name;
		final String source;
		final String info;
		final int infoColor;
		/** Remplissage de la barre de 0 à 1, ou négatif s'il n'y a pas de barre */
		final float bar;

		Target(ItemStack icon, String name, String source, String info, int infoColor, float bar) {
			this.icon = icon;
			this.name = name;
			this.source = source;
			this.info = info;
			this.infoColor = infoColor;
			this.bar = bar;
		}
	}

	private static final int PAD = 4;
	private static final int ICON = 16;
	private static final int MIN_WIDTH = 100;
	private static final int GREEN = 0xFF7BE495;
	private static final int YELLOW = 0xFFFFD166;
	private static final int RED = 0xFFFF6B6B;

	public LookModule() {
		super("look", "Bloc visé");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0.5f, 0f);
	}

	@Override
	public boolean centered() {
		return true;
	}

	@Override
	public String hint() {
		return "Visible quand tu regardes un bloc ou une créature";
	}

	@Override
	public boolean hasContent(MinecraftClient mc) {
		return target(mc, false) != null;
	}

	/** Nom du mod qui ajoute le bloc ou la créature (« Minecraft » pour le jeu de base) */
	private static String modName(String namespace) {
		if (namespace.equals("minecraft")) return "Minecraft";
		//#if FORGE
		//$$ for (net.minecraftforge.fml.common.ModContainer mod : net.minecraftforge.fml.common.Loader.instance().getModList()) {
		//$$ 	if (mod.getModId().equalsIgnoreCase(namespace)) return mod.getName();
		//$$ }
		//#else
		for (ModContainer mod : FabricLoader.getInstance().getAllMods()) {
			if (mod.getMetadata().getId().equals(namespace)) return mod.getMetadata().getName();
		}
		//#endif
		return namespace;
	}

	/** Nom de ce qui est visé (auto-test) */
	public static String targetName(MinecraftClient mc) {
		Target t = target(mc, false);
		return t != null ? t.name : null;
	}

	private static Target target(MinecraftClient mc, boolean preview) {
		Target t = null;
		BlockHitResult hit = mc.result;
		if (mc.world != null && mc.player != null && hit != null) {
			if (hit.type == BlockHitResult.Type.BLOCK) t = block(mc, hit.getBlockPos());
			else if (hit.type == BlockHitResult.Type.ENTITY && hit.entity != null) t = entity(hit.entity);
		}
		if (t == null && preview) {
			t = new Target(new ItemStack(Item.fromBlock(Blocks.GRASS)), "Bloc d'herbe", "Minecraft", "✔ Récoltable", GREEN, -1);
		}
		return t;
	}

	private static Target block(MinecraftClient mc, BlockPos pos) {
		Block block = mc.world.getBlockState(pos).getBlock();
		if (block == Blocks.AIR) return null;
		// Comme le clic molette : objet et variante (couleur, essence…) du bloc, ex. « Argile orange »
		Item item = block.getPickItem(mc.world, pos);
		ItemStack icon = item != null ? new ItemStack(item, 1, block.getMeta(mc.world, pos)) : null;
		String name = icon != null ? icon.getCustomName() : block.getTranslatedName();
		Identifier id = Block.REGISTRY.getIdentifier(block);
		String source = modName(id != null ? id.getNamespace() : "minecraft");

		float progress = mc.interactionManager != null && mc.interactionManager.isBreakingBlock()
			? ((InteractionManagerAccessor) mc.interactionManager).getCurrentBreakingProgress() : 0;
		if (progress > 0) {
			return new Target(icon, name, source, String.format(Locale.ROOT, "Minage %d %%", Math.round(progress * 100)), YELLOW, progress);
		}
		if (block.getStrength(mc.world, pos) < 0) return new Target(icon, name, source, "Incassable", RED, -1);
		// Yarn 1.8.9 : doesBlockMovement() vaut en réalité « pas besoin d'outil »
		if (!block.getMaterial().doesBlockMovement()) {
			boolean ok = mc.player.isUsingEffectiveTool(block);
			return new Target(icon, name, source, ok ? "✔ Récoltable" : "✘ Mauvais outil", ok ? GREEN : RED, -1);
		}
		return new Target(icon, name, source, null, 0, -1);
	}

	private static Target entity(Entity entity) {
		ItemStack icon = null;
		if (entity instanceof ItemEntity) {
			icon = ((ItemEntity) entity).getItemStack();
		} else if (entity instanceof PlayerEntity) {
			icon = new ItemStack(Items.SKULL, 1, 3);
		} else {
			int id = EntityType.getIdByEntity(entity);
			if (id > 0) icon = new ItemStack(Items.SPAWN_EGG, 1, id);
		}
		String name = entity.getName().asUnformattedString();
		if (entity instanceof LivingEntity) {
			LivingEntity living = (LivingEntity) entity;
			float health = living.getHealth();
			float max = Math.max(1, living.getMaxHealth());
			String info = String.format(Locale.ROOT, "❤ %s / %s", amount(health), amount(max));
			return new Target(icon, name, "Minecraft", info, RED, Draw.clamp(health / max, 0f, 1f));
		}
		return new Target(icon, name, "Minecraft", null, 0, -1);
	}

	/** 20 → « 20 », 7.5 → « 7.5 » */
	private static String amount(float value) {
		float rounded = Math.round(value * 10) / 10f;
		return rounded == Math.floor(rounded) ? String.valueOf((int) rounded) : String.valueOf(rounded);
	}

	private static int textLeft(Target t) {
		return PAD + (t.icon != null ? ICON + 5 : 0);
	}

	@Override
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		if (t == null) return MIN_WIDTH;
		int text = Math.max(g.textWidth(t.name), g.textWidth(t.source));
		if (t.info != null) text = Math.max(text, g.textWidth(t.info));
		return Math.max(MIN_WIDTH, textLeft(t) + text + PAD + 2);
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		int lines = t == null ? 2 : t.info != null ? 3 : 2;
		int bar = t != null && t.bar >= 0 ? 5 : 0;
		return Math.max(ICON, lines * 10 - 1 + bar) + PAD * 2;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		if (t == null) return;
		int w = width(mc, g, s, preview);
		int h = height(mc, g, s, preview);
		Draw.panel(g, 0, 0, w, h, s);
		if (t.icon != null) g.item(t.icon, PAD, (h - ICON) / 2);

		int x = textLeft(t);
		int y = PAD;
		g.text(t.name, x, y, Theme.WHITE, s.shadow);
		y += 10;
		g.text(t.source, x, y, Draw.textColor(s), s.shadow);
		y += 10;
		if (t.info != null) {
			g.text(t.info, x, y, t.infoColor, s.shadow);
			y += 10;
		}
		if (t.bar >= 0) {
			int barW = w - x - PAD;
			g.fill(x, y + 1, x + barW, y + 3, 0x50FFFFFF);
			g.fill(x, y + 1, x + Math.round(barW * t.bar), y + 3, t.infoColor);
		}
	}
}

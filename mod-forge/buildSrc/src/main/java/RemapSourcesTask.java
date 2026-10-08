import net.fabricmc.mappingio.MappingReader;
import net.fabricmc.mappingio.tree.MappingTree;
import net.fabricmc.mappingio.tree.MemoryMappingTree;
import org.cadixdev.lorenz.MappingSet;
import org.cadixdev.lorenz.model.ClassMapping;
import org.cadixdev.mercury.Mercury;
import org.cadixdev.mercury.remapper.MercuryRemapper;
import org.gradle.api.DefaultTask;
import org.gradle.api.file.ConfigurableFileCollection;
import org.gradle.api.file.DirectoryProperty;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.tasks.Classpath;
import org.gradle.api.tasks.InputDirectory;
import org.gradle.api.tasks.InputFile;
import org.gradle.api.tasks.InputFiles;
import org.gradle.api.tasks.OutputDirectory;
import org.gradle.api.tasks.PathSensitive;
import org.gradle.api.tasks.PathSensitivity;
import org.gradle.api.tasks.TaskAction;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Code du mod 1.8.9 Legacy Fabric (noms Yarn) → code Forge (noms MCP), à chaque compilation :
 * 1. copie des sources (sans les mixins, écrits à part pour Forge) en activant les blocs « //#if FORGE »
 *    (le code Forge y est commenté par « //$$ », et le code Fabric du « //#else » est commenté à son tour) ;
 * 2. renommage des classes, méthodes et champs de Minecraft avec Mercury, en reliant les deux jeux de noms
 *    par les noms d'origine du jeu (« official »), présents dans les deux fichiers de correspondance.
 */
public abstract class RemapSourcesTask extends DefaultTask {
	/** Sources du mod 1.8.9 (mod-legacy/src/main/java) */
	@InputDirectory
	@PathSensitive(PathSensitivity.RELATIVE)
	public abstract DirectoryProperty getLegacySources();

	/** Classes de réglages partagées avec le mod moderne (racine de sources de mod/) */
	@InputDirectory
	@PathSensitive(PathSensitivity.RELATIVE)
	public abstract DirectoryProperty getSharedSources();

	/** Fichiers à prendre dans les sources partagées, relatifs à leur racine */
	@org.gradle.api.tasks.Input
	public abstract org.gradle.api.provider.ListProperty<String> getSharedFiles();

	/** official → named (Yarn) */
	@InputFile
	@PathSensitive(PathSensitivity.NONE)
	public abstract RegularFileProperty getYarnMappings();

	/** official → named (MCP) */
	@InputFile
	@PathSensitive(PathSensitivity.NONE)
	public abstract RegularFileProperty getMcpMappings();

	/** Minecraft en noms Yarn et bibliothèques du jeu, pour que Mercury comprenne le code d'origine */
	@Classpath
	public abstract ConfigurableFileCollection getClasspath();

	@OutputDirectory
	public abstract DirectoryProperty getOutput();

	private static final String MIXIN_DIR = "fr/alykell/aloria/hud/mixin/";

	@TaskAction
	public void run() throws Exception {
		Path out = getOutput().get().getAsFile().toPath();
		Path work = getTemporaryDir().toPath().resolve("preprocessed");
		deleteTree(work);
		deleteTree(out);
		Files.createDirectories(work);

		Path legacy = getLegacySources().get().getAsFile().toPath();
		try (Stream<Path> files = Files.walk(legacy)) {
			for (Path file : (Iterable<Path>) files.filter(Files::isRegularFile)::iterator) {
				String rel = legacy.relativize(file).toString().replace(File.separatorChar, '/');
				if (rel.startsWith(MIXIN_DIR) || !rel.endsWith(".java")) continue;
				preprocess(file, work.resolve(rel));
			}
		}
		Path shared = getSharedSources().get().getAsFile().toPath();
		for (String rel : getSharedFiles().get()) preprocess(shared.resolve(rel), work.resolve(rel));

		Mercury mercury = new Mercury();
		for (File f : getClasspath().getFiles()) if (f.exists()) mercury.getClassPath().add(f.toPath());
		mercury.setSourceCompatibility("1.8");
		// Les blocs Forge (imports net.minecraftforge…) ne se résolvent pas avec le Minecraft en noms Yarn : on les laisse tels quels
		mercury.setGracefulClasspathChecks(true);
		mercury.getProcessors().add(MercuryRemapper.create(mappings()));
		Files.createDirectories(out);
		mercury.rewrite(work, out);
	}

	/** Active les blocs « //#if FORGE » et met en commentaire leur « //#else » (le code pour Fabric) */
	private static void preprocess(Path from, Path to) throws IOException {
		List<String> lines = Files.readAllLines(from, StandardCharsets.UTF_8);
		List<String> result = new ArrayList<>(lines.size());
		int state = 0; // 0 hors bloc, 1 branche Forge, 2 branche Fabric
		for (String line : lines) {
			String t = line.trim();
			if (t.equals("//#if FORGE")) state = 1;
			else if (t.equals("//#else") && state == 1) state = 2;
			else if (t.equals("//#endif") && state != 0) state = 0;
			else if (state == 1) line = line.replaceFirst("//[$][$] ?", "");
			else if (state == 2) {
				int indent = 0;
				while (indent < line.length() && Character.isWhitespace(line.charAt(indent))) indent++;
				line = line.substring(0, indent) + "//$$ " + line.substring(indent);
			}
			result.add(line);
		}
		Files.createDirectories(to.getParent());
		Files.write(to, result, StandardCharsets.UTF_8);
	}

	/** Yarn → MCP, reliés par les noms officiels (obfusqués) du jeu */
	private MappingSet mappings() throws IOException {
		MemoryMappingTree yarn = new MemoryMappingTree();
		MappingReader.read(getYarnMappings().get().getAsFile().toPath(), yarn);
		MemoryMappingTree mcp = new MemoryMappingTree();
		MappingReader.read(getMcpMappings().get().getAsFile().toPath(), mcp);
		int yarnNamed = yarn.getNamespaceId("named");
		int mcpNamed = mcp.getNamespaceId("named");
		int mcpOfficial = mcp.getNamespaceId("official");

		MappingSet set = MappingSet.create();
		for (MappingTree.ClassMapping yc : yarn.getClasses()) {
			String official = yc.getSrcName();
			MappingTree.ClassMapping mc = mcp.getClass(official, mcpOfficial);
			if (mc == null) continue;
			String from = yc.getName(yarnNamed);
			String to = mc.getName(mcpNamed);
			if (from == null || to == null) continue;
			ClassMapping<?, ?> cm = set.getOrCreateClassMapping(from);
			// Classe interne : Lorenz attend son nom simple
			cm.setDeobfuscatedName(to.contains("$") ? to.substring(to.lastIndexOf('$') + 1) : to);

			Map<String, MappingTree.MethodMapping> mcpMethods = new HashMap<>();
			for (MappingTree.MethodMapping m : mc.getMethods()) mcpMethods.put(m.getSrcName() + m.getSrcDesc(), m);
			for (MappingTree.MethodMapping ym : yc.getMethods()) {
				MappingTree.MethodMapping mm = mcpMethods.get(ym.getSrcName() + ym.getSrcDesc());
				String a = ym.getName(yarnNamed);
				String b = mm != null ? mm.getName(mcpNamed) : null;
				if (a != null && b != null && !a.equals(b)) cm.getOrCreateMethodMapping(a, ym.getDesc(yarnNamed)).setDeobfuscatedName(b);
			}
			Map<String, MappingTree.FieldMapping> mcpFields = new HashMap<>();
			for (MappingTree.FieldMapping f : mc.getFields()) mcpFields.put(f.getSrcName(), f);
			for (MappingTree.FieldMapping yf : yc.getFields()) {
				MappingTree.FieldMapping mf = mcpFields.get(yf.getSrcName());
				String a = yf.getName(yarnNamed);
				String b = mf != null ? mf.getName(mcpNamed) : null;
				if (a != null && b != null && !a.equals(b)) cm.getOrCreateFieldMapping(a).setDeobfuscatedName(b);
			}
		}
		return set;
	}

	private static void deleteTree(Path dir) throws IOException {
		if (!Files.exists(dir)) return;
		try (Stream<Path> files = Files.walk(dir)) {
			List<Path> all = new ArrayList<>();
			files.forEach(all::add);
			for (int i = all.size() - 1; i >= 0; i--) Files.delete(all.get(i));
		}
	}
}

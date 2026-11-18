using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Studio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ComponentSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "component_sections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    component_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    subtitle = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_component_sections", x => x.id);
                    table.ForeignKey(
                        name: "fk_component_sections_components_component_id",
                        column: x => x.component_id,
                        principalTable: "components",
                        principalColumn: "artifact_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_component_sections_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "component_columns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    section_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    data_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    required = table.Column<bool>(type: "boolean", nullable: false),
                    is_key = table.Column<bool>(type: "boolean", nullable: false),
                    role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_component_columns", x => x.id);
                    table.ForeignKey(
                        name: "fk_component_columns_component_sections_section_id",
                        column: x => x.section_id,
                        principalTable: "component_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_component_columns_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_component_columns_project_id",
                table: "component_columns",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_component_columns_section_id_position",
                table: "component_columns",
                columns: new[] { "section_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_component_sections_component_id_position",
                table: "component_sections",
                columns: new[] { "component_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_component_sections_project_id",
                table: "component_sections",
                column: "project_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "component_columns");

            migrationBuilder.DropTable(
                name: "component_sections");
        }
    }
}
